/**
 * Unit tests for IconManager service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IconManager, ICON_STATES, iconManager } from '../../services/icon-manager.js';
import type { AnalysisResult, IconState } from '../../types/index.js';

// Mock browser APIs
const mockBrowser = {
  action: {
    setIcon: vi.fn().mockResolvedValue(undefined),
    setTitle: vi.fn().mockResolvedValue(undefined),
    setBadgeText: vi.fn().mockResolvedValue(undefined),
    setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined)
  },
  tabs: {
    onUpdated: {
      addListener: vi.fn()
    },
    onRemoved: {
      addListener: vi.fn()
    }
  }
};

// Mock global browser object
global.browser = mockBrowser as any;

describe('IconManager', () => {
  let iconManagerInstance: IconManager;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Get the singleton instance for testing
    iconManagerInstance = iconManager.getInstance();
    
    // Clear any existing state
    iconManagerInstance.clearAllStates();
  });

  describe('constructor', () => {
    it('should initialize with proper event listeners', () => {
      // Create a new instance to test constructor behavior
      const testInstance = new IconManager();
      expect(mockBrowser.tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(mockBrowser.tabs.onRemoved.addListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('updateIconFromAnalysisResult', () => {
    it('should set high credibility icon for high score and factual content', () => {
      const result: AnalysisResult = {
        id: 'test-1',
        url: 'https://example.com',
        title: 'Test Article',
        credibilityScore: 85,
        categories: {
          fact: 80,
          opinion: 15,
          false: 5
        },
        confidence: 90,
        reasoning: 'High factual content',
        timestamp: Date.now(),
        contentHash: 'hash123'
      };

      iconManager.updateIconFromAnalysisResult(123, result);

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 123,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 123,
        text: '✓'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 123,
        color: '#34a853'
      });
    });

    it('should set low credibility icon for low score', () => {
      const result: AnalysisResult = {
        id: 'test-2',
        url: 'https://example.com',
        title: 'Test Article',
        credibilityScore: 25,
        categories: {
          fact: 20,
          opinion: 30,
          false: 50
        },
        confidence: 80,
        reasoning: 'Low credibility content',
        timestamp: Date.now(),
        contentHash: 'hash456'
      };

      iconManager.updateIconFromAnalysisResult(456, result);

      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 456,
        text: '!'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 456,
        color: '#ea4335'
      });
    });

    it('should set opinion icon for primarily opinion content', () => {
      const result: AnalysisResult = {
        id: 'test-3',
        url: 'https://example.com',
        title: 'Test Article',
        credibilityScore: 55,
        categories: {
          fact: 25,
          opinion: 65,
          false: 10
        },
        confidence: 75,
        reasoning: 'Opinion-based content',
        timestamp: Date.now(),
        contentHash: 'hash789'
      };

      iconManager.updateIconFromAnalysisResult(789, result);

      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 789,
        text: '?'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 789,
        color: '#fbbc04'
      });
    });

    it('should set low credibility icon for primarily false content', () => {
      const result: AnalysisResult = {
        id: 'test-4',
        url: 'https://example.com',
        title: 'Test Article',
        credibilityScore: 75, // High score but false content should override
        categories: {
          fact: 20,
          opinion: 15,
          false: 65
        },
        confidence: 85,
        reasoning: 'Primarily false content',
        timestamp: Date.now(),
        contentHash: 'hash101'
      };

      iconManager.updateIconFromAnalysisResult(101, result);

      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 101,
        text: '!'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 101,
        color: '#ea4335'
      });
    });
  });

  describe('setAnalyzingState', () => {
    it('should set analyzing icon state', () => {
      iconManager.setAnalyzingState(123);

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 123,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 123,
        text: '...'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 123,
        color: '#1a73e8'
      });
      expect(mockBrowser.action.setTitle).toHaveBeenCalledWith({
        tabId: 123,
        title: 'Fact Checker - Analyzing content...'
      });
    });
  });

  describe('setErrorState', () => {
    it('should set error icon state', () => {
      iconManager.setErrorState(456, 'Analysis failed');

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 456,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 456,
        text: '!'
      });
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
        tabId: 456,
        color: '#ea4335'
      });
      expect(mockBrowser.action.setTitle).toHaveBeenCalledWith({
        tabId: 456,
        title: 'Fact Checker - Analysis error'
      });
    });
  });

  describe('resetIconForTab', () => {
    it('should reset icon to default state', () => {
      iconManager.resetIconForTab(789);

      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 789,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledWith({
        tabId: 789,
        text: ''
      });
      expect(mockBrowser.action.setTitle).toHaveBeenCalledWith({
        tabId: 789,
        title: 'Fact Checker - Click to analyze content'
      });
    });
  });

  describe('getIconStateForTab', () => {
    it('should return undefined for tab with no state', () => {
      const state = iconManager.getIconStateForTab(999);
      expect(state).toBeUndefined();
    });

    it('should return stored state for tab', () => {
      const iconState: IconState = {
        type: 'analyzing',
        badgeText: '...',
        badgeColor: '#1a73e8'
      };

      iconManager.updateIcon(123, iconState);
      const retrievedState = iconManager.getIconStateForTab(123);

      expect(retrievedState).toEqual(iconState);
    });
  });

  describe('updateMultipleTabs', () => {
    it('should update multiple tabs with same state', () => {
      const iconState: IconState = {
        type: 'error',
        badgeText: '!',
        badgeColor: '#ea4335'
      };

      iconManager.updateMultipleTabs([123, 456, 789], iconState);

      expect(mockBrowser.action.setIcon).toHaveBeenCalledTimes(3);
      expect(mockBrowser.action.setBadgeText).toHaveBeenCalledTimes(3);
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(3);

      // Verify each tab was updated
      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 123,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 456,
        path: '/icon/128.png'
      });
      expect(mockBrowser.action.setIcon).toHaveBeenCalledWith({
        tabId: 789,
        path: '/icon/128.png'
      });
    });
  });

  describe('getAllTabStates', () => {
    it('should return all current tab states', () => {
      const state1: IconState = { type: 'analyzing' };
      const state2: IconState = { type: 'high-credibility' };

      iconManager.updateIcon(123, state1);
      iconManager.updateIcon(456, state2);

      const allStates = iconManager.getAllTabStates();

      expect(allStates.size).toBe(2);
      expect(allStates.get(123)).toEqual(state1);
      expect(allStates.get(456)).toEqual(state2);
    });
  });

  describe('clearAllStates', () => {
    it('should clear all tab states', () => {
      iconManager.updateIcon(123, { type: 'analyzing' });
      iconManager.updateIcon(456, { type: 'error' });

      expect(iconManager.getAllTabStates().size).toBe(2);

      iconManager.clearAllStates();

      expect(iconManager.getAllTabStates().size).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle browser API errors gracefully', () => {
      // Mock browser API to throw error
      mockBrowser.action.setIcon.mockRejectedValueOnce(new Error('API Error'));

      // Should not throw error
      expect(() => {
        iconManager.resetIconForTab(123);
      }).not.toThrow();
    });

    it('should continue with other operations if one fails', () => {
      // Mock one API to fail
      mockBrowser.action.setBadgeText.mockRejectedValueOnce(new Error('Badge Error'));

      iconManager.setAnalyzingState(123);

      // Other APIs should still be called
      expect(mockBrowser.action.setIcon).toHaveBeenCalled();
      expect(mockBrowser.action.setBadgeBackgroundColor).toHaveBeenCalled();
      expect(mockBrowser.action.setTitle).toHaveBeenCalled();
    });
  });

  describe('tab state management', () => {
    it('should handle tab state cleanup correctly', () => {
      // Set up some tab state
      iconManagerInstance.updateIcon(123, { type: 'analyzing' });
      expect(iconManagerInstance.getIconStateForTab(123)).toBeDefined();

      // Manually test the cleanup functionality
      iconManagerInstance.clearAllStates();
      expect(iconManagerInstance.getIconStateForTab(123)).toBeUndefined();
    });
  });

  describe('ICON_STATES constants', () => {
    it('should export all required icon state constants', () => {
      expect(ICON_STATES.DEFAULT).toBe('default');
      expect(ICON_STATES.ANALYZING).toBe('analyzing');
      expect(ICON_STATES.HIGH_CREDIBILITY).toBe('high-credibility');
      expect(ICON_STATES.LOW_CREDIBILITY).toBe('low-credibility');
      expect(ICON_STATES.OPINION).toBe('opinion');
      expect(ICON_STATES.ERROR).toBe('error');
    });
  });
});