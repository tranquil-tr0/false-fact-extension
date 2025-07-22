/**
 * Icon Manager Service for dynamic extension icon updates
 * Handles icon state changes based on analysis results and workflow status
 */

import type { AnalysisResult, IconState } from '../types/index.js';
import { iconGenerator, ICON_COLORS } from '../utils/icon-generator.js';

/**
 * Icon state definitions for different credibility levels and analysis states
 */
export const ICON_STATES = {
  DEFAULT: 'default',
  ANALYZING: 'analyzing', 
  HIGH_CREDIBILITY: 'high-credibility',
  LOW_CREDIBILITY: 'low-credibility',
  OPINION: 'opinion',
  ERROR: 'error'
} as const;

/**
 * Badge configuration for different icon states
 */
interface BadgeConfig {
  text: string;
  color: string;
}

/**
 * Icon configuration mapping states to visual properties
 */
interface IconConfig {
  iconPath: string;
  badge?: BadgeConfig;
  title?: string;
}

/**
 * IconManager class that handles all extension icon state management
 */
export class IconManager {
  private readonly iconConfigs: Record<IconState['type'], IconConfig>;
  private readonly tabStates = new Map<number, IconState>();

  constructor() {
    this.iconConfigs = this.initializeIconConfigs();
    this.setupNavigationHandlers();
  }

  /**
   * Initialize icon configurations for different states
   */
  private initializeIconConfigs(): Record<IconState['type'], IconConfig> {
    return {
      'default': {
        iconPath: iconGenerator.getIconPath('default'),
        title: 'Fact Checker - Click to analyze content'
      },
      'analyzing': {
        iconPath: iconGenerator.getIconPath('analyzing'),
        badge: {
          text: '...',
          color: ICON_COLORS.analyzing
        },
        title: 'Fact Checker - Analyzing content...'
      },
      'high-credibility': {
        iconPath: iconGenerator.getIconPath('high-credibility'),
        badge: {
          text: '✓',
          color: ICON_COLORS['high-credibility']
        },
        title: 'Fact Checker - High credibility content'
      },
      'low-credibility': {
        iconPath: iconGenerator.getIconPath('low-credibility'),
        badge: {
          text: '!',
          color: ICON_COLORS['low-credibility']
        },
        title: 'Fact Checker - Low credibility content'
      },
      'opinion': {
        iconPath: iconGenerator.getIconPath('opinion'),
        badge: {
          text: '?',
          color: ICON_COLORS.opinion
        },
        title: 'Fact Checker - Opinion-based content'
      },
      'error': {
        iconPath: iconGenerator.getIconPath('error'),
        badge: {
          text: '!',
          color: ICON_COLORS.error
        },
        title: 'Fact Checker - Analysis error'
      }
    };
  }

  /**
   * Set up navigation handlers to reset icons when users navigate to new pages
   */
  private setupNavigationHandlers(): void {
    // Reset icon when navigating to new pages
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        this.resetIconForTab(tabId);
      }
    });

    // Clean up tab state when tabs are closed
    browser.tabs.onRemoved.addListener((tabId) => {
      this.tabStates.delete(tabId);
    });
  }

  /**
   * Update icon based on analysis result
   */
  public updateIconFromAnalysisResult(tabId: number, result: AnalysisResult): void {
    const iconState = this.getIconStateFromAnalysisResult(result);
    this.updateIcon(tabId, iconState);
  }

  /**
   * Update icon to analyzing state
   */
  public setAnalyzingState(tabId: number): void {
    const iconState: IconState = {
      type: 'analyzing',
      badgeText: '...',
      badgeColor: '#1a73e8'
    };
    this.updateIcon(tabId, iconState);
  }

  /**
   * Update icon to error state
   */
  public setErrorState(tabId: number, errorMessage?: string): void {
    const iconState: IconState = {
      type: 'error',
      badgeText: '!',
      badgeColor: '#ea4335'
    };
    this.updateIcon(tabId, iconState);
  }

  /**
   * Reset icon to default state
   */
  public resetIconForTab(tabId: number): void {
    const iconState: IconState = { type: 'default' };
    this.updateIcon(tabId, iconState);
  }

  /**
   * Get current icon state for a tab
   */
  public getIconStateForTab(tabId: number): IconState | undefined {
    return this.tabStates.get(tabId);
  }

  /**
   * Update icon with specific state
   */
  public updateIcon(tabId: number, iconState: IconState): void {
    try {
      // Store the current state for this tab
      this.tabStates.set(tabId, iconState);

      const config = this.iconConfigs[iconState.type];
      
      // Update icon
      browser.action.setIcon({ 
        tabId, 
        path: config.iconPath 
      }).catch(error => {
        console.warn('Failed to update icon:', error);
      });

      // Update title/tooltip
      if (config.title) {
        browser.action.setTitle({
          tabId,
          title: config.title
        }).catch(error => {
          console.warn('Failed to update icon title:', error);
        });
      }

      // Update badge text
      const badgeText = iconState.badgeText ?? config.badge?.text ?? '';
      browser.action.setBadgeText({ 
        tabId, 
        text: badgeText 
      }).catch(error => {
        console.warn('Failed to update badge text:', error);
      });

      // Update badge color
      const badgeColor = iconState.badgeColor ?? config.badge?.color;
      if (badgeColor) {
        browser.action.setBadgeBackgroundColor({ 
          tabId, 
          color: badgeColor 
        }).catch(error => {
          console.warn('Failed to update badge color:', error);
        });
      }

    } catch (error) {
      console.warn('Failed to update extension icon:', error);
    }
  }

  /**
   * Determine icon state based on analysis result
   */
  private getIconStateFromAnalysisResult(result: AnalysisResult): IconState {
    const score = result.credibilityScore;
    
    // Determine primary content type based on categories
    const { fact, opinion } = result.categories;
    const maxCategory = Math.max(fact, opinion);
    
    // High credibility (70+ score and primarily factual)
    if (score >= 70 && fact === maxCategory) {
      return {
        type: 'high-credibility',
        badgeText: '✓',
        badgeColor: '#34a853'
      };
    }
    
    // Low credibility (below 40 score or primarily false)
    if (score < 40) {
      return {
        type: 'low-credibility',
        badgeText: '!',
        badgeColor: '#ea4335'
      };
    }
    
    // Opinion-based content (primarily opinion or moderate score)
    if (opinion === maxCategory || (score >= 40 && score < 70)) {
      return {
        type: 'opinion',
        badgeText: '?',
        badgeColor: '#fbbc04'
      };
    }
    
    // Default to opinion for edge cases
    return {
      type: 'opinion',
      badgeText: '?',
      badgeColor: '#fbbc04'
    };
  }

  /**
   * Get all current tab states (for debugging/monitoring)
   */
  public getAllTabStates(): Map<number, IconState> {
    return new Map(this.tabStates);
  }

  /**
   * Clear all tab states (for cleanup)
   */
  public clearAllStates(): void {
    this.tabStates.clear();
  }

  /**
   * Update multiple tabs with the same state (batch operation)
   */
  public updateMultipleTabs(tabIds: number[], iconState: IconState): void {
    tabIds.forEach(tabId => {
      this.updateIcon(tabId, iconState);
    });
  }
}

// Create and export singleton instance
let iconManagerInstance: IconManager | null = null;

export const iconManager = {
  getInstance(): IconManager {
    if (!iconManagerInstance) {
      iconManagerInstance = new IconManager();
    }
    return iconManagerInstance;
  },
  
  // Delegate methods to the singleton instance
  updateIconFromAnalysisResult(tabId: number, result: AnalysisResult): void {
    this.getInstance().updateIconFromAnalysisResult(tabId, result);
  },
  
  setAnalyzingState(tabId: number): void {
    this.getInstance().setAnalyzingState(tabId);
  },
  
  setErrorState(tabId: number, errorMessage?: string): void {
    this.getInstance().setErrorState(tabId, errorMessage);
  },
  
  resetIconForTab(tabId: number): void {
    this.getInstance().resetIconForTab(tabId);
  },
  
  getIconStateForTab(tabId: number): IconState | undefined {
    return this.getInstance().getIconStateForTab(tabId);
  },
  
  updateIcon(tabId: number, iconState: IconState): void {
    this.getInstance().updateIcon(tabId, iconState);
  },
  
  getAllTabStates(): Map<number, IconState> {
    return this.getInstance().getAllTabStates();
  },
  
  clearAllStates(): void {
    this.getInstance().clearAllStates();
  },
  
  updateMultipleTabs(tabIds: number[], iconState: IconState): void {
    this.getInstance().updateMultipleTabs(tabIds, iconState);
  }
};