/**
 * Icon generation utilities for dynamic extension icon states
 * Generates colored variations of the base icon for different credibility states
 */

import type { IconState } from '../types/index.js';

/**
 * Color schemes for different icon states
 * Colors chosen to meet WCAG AA contrast requirements (3:1 ratio minimum)
 */
export const ICON_COLORS = {
  default: '#3c4043',        // Darker gray - neutral state (better contrast)
  analyzing: '#1565c0',      // Darker blue - analyzing state (better contrast)
  'high-credibility': '#2e7d32',  // Darker green - high credibility (better contrast)
  'low-credibility': '#d32f2f',   // Darker red - low credibility (better contrast)
  opinion: '#f57c00',        // Darker orange - opinion content (better contrast)
  error: '#d32f2f'           // Darker red - error state (better contrast)
} as const;

/**
 * Icon size configurations for different browser requirements
 */
export const ICON_SIZES = [16, 32, 48, 96, 128] as const;

/**
 * Icon path configurations for different states
 */
interface IconPaths {
  [key: string]: {
    [size: number]: string;
  };
}

/**
 * IconGenerator class for creating and managing dynamic icon states
 */
export class IconGenerator {
  private iconPaths: IconPaths = {};
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor() {
    this.initializeIconPaths();
    this.initializeCanvas();
  }

  /**
   * Initialize icon paths for different states and sizes
   */
  private initializeIconPaths(): void {
    // For now, use the same base icon for all states
    // In the future, this could be expanded to use different base icons
    for (const state of Object.keys(ICON_COLORS)) {
      this.iconPaths[state] = {};
      for (const size of ICON_SIZES) {
        this.iconPaths[state][size] = `/icon/${size}.png`;
      }
    }
  }

  /**
   * Initialize canvas for programmatic icon generation
   */
  private initializeCanvas(): void {
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
  }

  /**
   * Get icon path for a specific state and size
   */
  public getIconPath(state: IconState['type'], size: number = 128): string {
    return this.iconPaths[state]?.[size] || this.iconPaths.default[size] || '/icon/128.png';
  }

  /**
   * Get all icon paths for a specific state (all sizes)
   */
  public getIconPaths(state: IconState['type']): { [size: number]: string } {
    return this.iconPaths[state] || this.iconPaths.default;
  }

  /**
   * Generate a colored version of an icon (for future use)
   * This would be used if we want to programmatically generate colored icons
   */
  public async generateColoredIcon(
    baseIconUrl: string,
    color: string,
    size: number
  ): Promise<string | null> {
    if (!this.canvas || !this.ctx) {
      console.warn('Canvas not available for icon generation');
      return null;
    }

    try {
      // Set canvas size
      this.canvas.width = size;
      this.canvas.height = size;

      // Load base icon
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          if (!this.ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // Clear canvas
          this.ctx.clearRect(0, 0, size, size);

          // Draw base icon
          this.ctx.drawImage(img, 0, 0, size, size);

          // Apply color overlay using composite operation
          this.ctx.globalCompositeOperation = 'source-atop';
          this.ctx.fillStyle = color;
          this.ctx.fillRect(0, 0, size, size);

          // Convert to data URL
          const dataUrl = this.canvas!.toDataURL('image/png');
          resolve(dataUrl);
        };

        img.onerror = () => {
          reject(new Error(`Failed to load icon: ${baseIconUrl}`));
        };

        img.src = baseIconUrl;
      });

    } catch (error) {
      console.error('Error generating colored icon:', error);
      return null;
    }
  }

  /**
   * Create icon animation data for state transitions
   */
  public createIconAnimation(
    fromState: IconState['type'],
    toState: IconState['type'],
    duration: number = 300
  ): IconAnimationData {
    return {
      fromState,
      toState,
      duration,
      fromColor: ICON_COLORS[fromState],
      toColor: ICON_COLORS[toState],
      steps: this.generateAnimationSteps(
        ICON_COLORS[fromState],
        ICON_COLORS[toState],
        duration
      )
    };
  }

  /**
   * Generate animation steps for smooth color transitions
   */
  private generateAnimationSteps(
    fromColor: string,
    toColor: string,
    duration: number
  ): AnimationStep[] {
    const steps: AnimationStep[] = [];
    const stepCount = Math.max(5, Math.floor(duration / 50)); // 50ms per step minimum

    for (let i = 0; i <= stepCount; i++) {
      const progress = i / stepCount;
      const interpolatedColor = this.interpolateColor(fromColor, toColor, progress);
      
      steps.push({
        progress,
        color: interpolatedColor,
        timestamp: (duration / stepCount) * i
      });
    }

    return steps;
  }

  /**
   * Interpolate between two hex colors
   */
  private interpolateColor(color1: string, color2: string, factor: number): string {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');

    const r1 = parseInt(hex1.substr(0, 2), 16);
    const g1 = parseInt(hex1.substr(2, 2), 16);
    const b1 = parseInt(hex1.substr(4, 2), 16);

    const r2 = parseInt(hex2.substr(0, 2), 16);
    const g2 = parseInt(hex2.substr(2, 2), 16);
    const b2 = parseInt(hex2.substr(4, 2), 16);

    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Test icon visibility across different browser themes
   */
  public testIconVisibility(state: IconState['type']): IconVisibilityTest {
    const color = ICON_COLORS[state];
    
    return {
      state,
      color,
      lightThemeContrast: this.calculateContrast(color, '#ffffff'),
      darkThemeContrast: this.calculateContrast(color, '#202124'),
      recommendations: this.getVisibilityRecommendations(color)
    };
  }

  /**
   * Calculate color contrast ratio
   */
  private calculateContrast(color1: string, color2: string): number {
    const lum1 = this.getLuminance(color1);
    const lum2 = this.getLuminance(color2);
    
    const brightest = Math.max(lum1, lum2);
    const darkest = Math.min(lum1, lum2);
    
    return (brightest + 0.05) / (darkest + 0.05);
  }

  /**
   * Get luminance of a color
   */
  private getLuminance(hex: string): number {
    const rgb = hex.replace('#', '');
    const r = parseInt(rgb.substr(0, 2), 16) / 255;
    const g = parseInt(rgb.substr(2, 2), 16) / 255;
    const b = parseInt(rgb.substr(4, 2), 16) / 255;

    const [rs, gs, bs] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  /**
   * Get visibility recommendations for a color
   */
  private getVisibilityRecommendations(color: string): string[] {
    const recommendations: string[] = [];
    const lightContrast = this.calculateContrast(color, '#ffffff');
    const darkContrast = this.calculateContrast(color, '#202124');

    if (lightContrast < 3) {
      recommendations.push('Consider darker shade for light themes');
    }
    if (darkContrast < 3) {
      recommendations.push('Consider lighter shade for dark themes');
    }
    if (lightContrast > 7 && darkContrast > 7) {
      recommendations.push('Excellent contrast on both themes');
    }

    return recommendations;
  }
}

/**
 * Animation data interface
 */
export interface IconAnimationData {
  fromState: IconState['type'];
  toState: IconState['type'];
  duration: number;
  fromColor: string;
  toColor: string;
  steps: AnimationStep[];
}

/**
 * Animation step interface
 */
export interface AnimationStep {
  progress: number;
  color: string;
  timestamp: number;
}

/**
 * Icon visibility test result
 */
export interface IconVisibilityTest {
  state: IconState['type'];
  color: string;
  lightThemeContrast: number;
  darkThemeContrast: number;
  recommendations: string[];
}

// Create and export singleton instance
export const iconGenerator = new IconGenerator();