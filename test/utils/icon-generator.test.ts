/**
 * Unit tests for IconGenerator utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IconGenerator, iconGenerator, ICON_COLORS, ICON_SIZES } from '../../utils/icon-generator.js';
import type { IconState } from '../../types/index.js';

// Mock DOM APIs
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock-data')
  }),
  toDataURL: vi.fn().mockReturnValue('data:image/png;base64,mock-data')
};

const mockDocument = {
  createElement: vi.fn().mockReturnValue(mockCanvas)
};

// Mock global document
global.document = mockDocument as any;

describe('IconGenerator', () => {
  let generator: IconGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new IconGenerator();
  });

  describe('constructor', () => {
    it('should initialize with proper icon paths', () => {
      expect(generator).toBeInstanceOf(IconGenerator);
    });

    it('should initialize canvas when document is available', () => {
      expect(mockDocument.createElement).toHaveBeenCalledWith('canvas');
    });
  });

  describe('getIconPath', () => {
    it('should return correct path for default state', () => {
      const path = generator.getIconPath('default');
      expect(path).toBe('/icon/128.png');
    });

    it('should return correct path for analyzing state', () => {
      const path = generator.getIconPath('analyzing');
      expect(path).toBe('/icon/128.png');
    });

    it('should return correct path for specific size', () => {
      const path = generator.getIconPath('default', 32);
      expect(path).toBe('/icon/32.png');
    });

    it('should fallback to default for unknown state', () => {
      const path = generator.getIconPath('unknown' as IconState['type']);
      expect(path).toBe('/icon/128.png');
    });
  });

  describe('getIconPaths', () => {
    it('should return all sizes for a state', () => {
      const paths = generator.getIconPaths('high-credibility');
      
      expect(paths).toEqual({
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        96: '/icon/96.png',
        128: '/icon/128.png'
      });
    });

    it('should fallback to default for unknown state', () => {
      const paths = generator.getIconPaths('unknown' as IconState['type']);
      
      expect(paths).toEqual({
        16: '/icon/16.png',
        32: '/icon/32.png',
        48: '/icon/48.png',
        96: '/icon/96.png',
        128: '/icon/128.png'
      });
    });
  });

  describe('generateColoredIcon', () => {
    it('should return null when canvas is not available', async () => {
      const generatorWithoutCanvas = new (class extends IconGenerator {
        constructor() {
          super();
          // Override canvas to null
          (this as any).canvas = null;
        }
      })();

      const result = await generatorWithoutCanvas.generateColoredIcon('/icon/128.png', '#ff0000', 128);
      expect(result).toBeNull();
    });

    it('should generate colored icon when canvas is available', async () => {
      // Mock Image constructor
      const mockImage = {
        crossOrigin: '',
        onload: null as any,
        onerror: null as any,
        src: ''
      };

      global.Image = vi.fn().mockImplementation(() => mockImage);

      const promise = generator.generateColoredIcon('/icon/128.png', '#ff0000', 128);

      // Simulate image load
      setTimeout(() => {
        if (mockImage.onload) {
          mockImage.onload();
        }
      }, 0);

      const result = await promise;
      expect(result).toBe('data:image/png;base64,mock-data');
    });

    it('should handle image load errors', async () => {
      const mockImage = {
        crossOrigin: '',
        onload: null as any,
        onerror: null as any,
        src: ''
      };

      global.Image = vi.fn().mockImplementation(() => mockImage);

      const promise = generator.generateColoredIcon('/icon/128.png', '#ff0000', 128);

      // Simulate image error
      setTimeout(() => {
        if (mockImage.onerror) {
          mockImage.onerror();
        }
      }, 0);

      await expect(promise).rejects.toThrow('Failed to load icon: /icon/128.png');
    });
  });

  describe('createIconAnimation', () => {
    it('should create animation data for state transition', () => {
      const animation = generator.createIconAnimation('default', 'high-credibility', 300);

      expect(animation).toEqual({
        fromState: 'default',
        toState: 'high-credibility',
        duration: 300,
        fromColor: ICON_COLORS.default,
        toColor: ICON_COLORS['high-credibility'],
        steps: expect.any(Array)
      });

      expect(animation.steps.length).toBeGreaterThan(0);
      expect(animation.steps[0].progress).toBe(0);
      expect(animation.steps[animation.steps.length - 1].progress).toBe(1);
    });

    it('should generate proper animation steps', () => {
      const animation = generator.createIconAnimation('analyzing', 'error', 200);

      // Check that steps are properly ordered
      for (let i = 1; i < animation.steps.length; i++) {
        expect(animation.steps[i].progress).toBeGreaterThan(animation.steps[i - 1].progress);
        expect(animation.steps[i].timestamp).toBeGreaterThan(animation.steps[i - 1].timestamp);
      }
    });
  });

  describe('testIconVisibility', () => {
    it('should test icon visibility for different states', () => {
      const test = generator.testIconVisibility('high-credibility');

      expect(test).toEqual({
        state: 'high-credibility',
        color: ICON_COLORS['high-credibility'],
        lightThemeContrast: expect.any(Number),
        darkThemeContrast: expect.any(Number),
        recommendations: expect.any(Array)
      });

      expect(test.lightThemeContrast).toBeGreaterThan(0);
      expect(test.darkThemeContrast).toBeGreaterThan(0);
    });

    it('should provide visibility recommendations', () => {
      const test = generator.testIconVisibility('analyzing');
      expect(Array.isArray(test.recommendations)).toBe(true);
    });

    it('should calculate proper contrast ratios', () => {
      const greenTest = generator.testIconVisibility('high-credibility');
      const redTest = generator.testIconVisibility('low-credibility');

      // Both should have reasonable contrast ratios
      expect(greenTest.lightThemeContrast).toBeGreaterThan(1);
      expect(greenTest.darkThemeContrast).toBeGreaterThan(1);
      expect(redTest.lightThemeContrast).toBeGreaterThan(1);
      expect(redTest.darkThemeContrast).toBeGreaterThan(1);
    });
  });

  describe('color interpolation', () => {
    it('should interpolate colors correctly', () => {
      // Test through animation creation
      const animation = generator.createIconAnimation('default', 'high-credibility', 100);
      
      // First step should be close to start color
      expect(animation.steps[0].color).toBe(ICON_COLORS.default);
      
      // Last step should be close to end color
      expect(animation.steps[animation.steps.length - 1].color).toBe(ICON_COLORS['high-credibility']);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(iconGenerator).toBeInstanceOf(IconGenerator);
    });

    it('should have consistent behavior with new instances', () => {
      const path1 = iconGenerator.getIconPath('default');
      const path2 = generator.getIconPath('default');
      expect(path1).toBe(path2);
    });
  });
});

describe('ICON_COLORS', () => {
  it('should export all required color constants', () => {
    expect(ICON_COLORS.default).toBe('#3c4043');
    expect(ICON_COLORS.analyzing).toBe('#1565c0');
    expect(ICON_COLORS['high-credibility']).toBe('#2e7d32');
    expect(ICON_COLORS['low-credibility']).toBe('#d32f2f');
    expect(ICON_COLORS.opinion).toBe('#f57c00');
    expect(ICON_COLORS.error).toBe('#d32f2f');
  });

  it('should have valid hex color format', () => {
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/;
    
    Object.values(ICON_COLORS).forEach(color => {
      expect(color).toMatch(hexColorRegex);
    });
  });
});

describe('ICON_SIZES', () => {
  it('should export all required size constants', () => {
    expect(ICON_SIZES).toEqual([16, 32, 48, 96, 128]);
  });

  it('should be in ascending order', () => {
    for (let i = 1; i < ICON_SIZES.length; i++) {
      expect(ICON_SIZES[i]).toBeGreaterThan(ICON_SIZES[i - 1]);
    }
  });
});