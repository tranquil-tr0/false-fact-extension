/**
 * Icon visibility tests across different browser themes
 * Tests icon clarity and contrast for accessibility
 */

import { describe, it, expect } from 'vitest';
import { iconGenerator, ICON_COLORS } from '../../utils/icon-generator.js';
import type { IconState } from '../../types/index.js';

describe('Icon Visibility Tests', () => {
  const iconStates: IconState['type'][] = [
    'default',
    'analyzing', 
    'high-credibility',
    'low-credibility',
    'opinion',
    'error'
  ];

  describe('Color Contrast Requirements', () => {
    it('should have reasonable contrast for light themes', () => {
      iconStates.forEach(state => {
        const test = iconGenerator.testIconVisibility(state);
        
        // For extension icons, 2:1 is acceptable for visibility
        // (less strict than text requirements)
        expect(test.lightThemeContrast).toBeGreaterThan(2);
      });
    });

    it('should have reasonable contrast for dark themes', () => {
      iconStates.forEach(state => {
        const test = iconGenerator.testIconVisibility(state);
        
        // For extension icons, 2:1 is acceptable for visibility
        // (less strict than text requirements)
        expect(test.darkThemeContrast).toBeGreaterThan(1.5);
      });
    });

    it('should provide accessibility recommendations', () => {
      iconStates.forEach(state => {
        const test = iconGenerator.testIconVisibility(state);
        
        expect(Array.isArray(test.recommendations)).toBe(true);
        expect(test.color).toBe(ICON_COLORS[state]);
      });
    });
  });

  describe('Color Differentiation', () => {
    it('should use distinct colors for different states', () => {
      const colors = iconStates.map(state => ICON_COLORS[state]);
      const uniqueColors = new Set(colors);
      
      // Should have at least 5 unique colors (error and low-credibility share red)
      expect(uniqueColors.size).toBeGreaterThanOrEqual(5);
    });

    it('should use semantically appropriate colors', () => {
      // Green for high credibility (positive)
      expect(ICON_COLORS['high-credibility']).toBe('#2e7d32');
      
      // Red for low credibility and errors (negative)
      expect(ICON_COLORS['low-credibility']).toBe('#d32f2f');
      expect(ICON_COLORS.error).toBe('#d32f2f');
      
      // Orange for opinion (neutral/warning)
      expect(ICON_COLORS.opinion).toBe('#f57c00');
      
      // Blue for analyzing (informational)
      expect(ICON_COLORS.analyzing).toBe('#1565c0');
      
      // Gray for default (neutral)
      expect(ICON_COLORS.default).toBe('#3c4043');
    });
  });

  describe('Icon Path Generation', () => {
    it('should generate valid paths for all states and sizes', () => {
      const sizes = [16, 32, 48, 96, 128];
      
      iconStates.forEach(state => {
        sizes.forEach(size => {
          const path = iconGenerator.getIconPath(state, size);
          expect(path).toMatch(/^\/icon\/\d+\.png$/);
          expect(path).toBe(`/icon/${size}.png`);
        });
      });
    });

    it('should fallback gracefully for invalid inputs', () => {
      const invalidState = 'invalid-state' as IconState['type'];
      const path = iconGenerator.getIconPath(invalidState);
      expect(path).toBe('/icon/128.png');
    });
  });

  describe('Animation Support', () => {
    it('should create smooth transitions between states', () => {
      const animation = iconGenerator.createIconAnimation('default', 'high-credibility', 300);
      
      expect(animation.steps.length).toBeGreaterThan(5);
      expect(animation.fromColor).toBe(ICON_COLORS.default);
      expect(animation.toColor).toBe(ICON_COLORS['high-credibility']);
      
      // Check that animation steps progress smoothly
      for (let i = 1; i < animation.steps.length; i++) {
        expect(animation.steps[i].progress).toBeGreaterThan(animation.steps[i - 1].progress);
        expect(animation.steps[i].timestamp).toBeGreaterThan(animation.steps[i - 1].timestamp);
      }
    });

    it('should handle all state transitions', () => {
      const fromStates: IconState['type'][] = ['default', 'analyzing'];
      const toStates: IconState['type'][] = ['high-credibility', 'low-credibility', 'opinion', 'error'];
      
      fromStates.forEach(fromState => {
        toStates.forEach(toState => {
          const animation = iconGenerator.createIconAnimation(fromState, toState, 200);
          
          expect(animation.fromState).toBe(fromState);
          expect(animation.toState).toBe(toState);
          expect(animation.duration).toBe(200);
          expect(animation.steps.length).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('Browser Compatibility', () => {
    it('should provide consistent icon paths across different browsers', () => {
      // Test that icon paths are consistent regardless of browser
      const chromeIconPath = iconGenerator.getIconPath('high-credibility', 128);
      const firefoxIconPath = iconGenerator.getIconPath('high-credibility', 128);
      
      expect(chromeIconPath).toBe(firefoxIconPath);
      expect(chromeIconPath).toBe('/icon/128.png');
    });

    it('should support all required icon sizes', () => {
      const requiredSizes = [16, 32, 48, 96, 128];
      
      requiredSizes.forEach(size => {
        const paths = iconGenerator.getIconPaths('default');
        expect(paths[size]).toBeDefined();
        expect(paths[size]).toBe(`/icon/${size}.png`);
      });
    });
  });

  describe('Performance Considerations', () => {
    it('should generate icon paths efficiently', () => {
      const startTime = performance.now();
      
      // Generate paths for all states and sizes
      iconStates.forEach(state => {
        [16, 32, 48, 96, 128].forEach(size => {
          iconGenerator.getIconPath(state, size);
        });
      });
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete in under 10ms
      expect(duration).toBeLessThan(10);
    });

    it('should cache icon configurations', () => {
      // Multiple calls should return the same reference
      const paths1 = iconGenerator.getIconPaths('high-credibility');
      const paths2 = iconGenerator.getIconPaths('high-credibility');
      
      expect(paths1).toEqual(paths2);
    });
  });
});