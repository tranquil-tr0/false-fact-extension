/**
 * Tests for the balance visualization component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BalanceVisualization } from '../../components/balance-visualization.js';
import { AnalysisResult } from '../../types/models.js';

// Mock performance.now for animation testing
Object.defineProperty(window, 'performance', {
  value: {
    now: vi.fn(() => Date.now()),
  },
});

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((cb) => setTimeout(cb, 16));

describe('BalanceVisualization', () => {
  let container: HTMLElement;
  let visualization: BalanceVisualization;
  let mockAnalysisResult: AnalysisResult;

  beforeEach(() => {
    // Create a fresh container for each test
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Create mock analysis result
    mockAnalysisResult = {
      id: 'test-1',
      url: 'https://example.com/article',
      title: 'Test Article',
      credibilityScore: 75,
      categories: {
        fact: 60,
        opinion: 25,
        false: 15,
      },
      confidence: 85,
      reasoning: 'Test reasoning',
      timestamp: Date.now(),
      contentHash: 'test-hash',
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create visualization with default options', () => {
      visualization = new BalanceVisualization(container);
      
      expect(container.classList.contains('balance-visualization')).toBe(true);
      expect(container.querySelector('.balance-header')).toBeTruthy();
      expect(container.querySelector('.balance-bar')).toBeTruthy();
      expect(container.querySelector('.credibility-score')).toBeTruthy();
    });

    it('should create visualization with custom options', () => {
      visualization = new BalanceVisualization(container, {
        width: 500,
        height: 80,
        showLabels: false,
        animated: false,
      });
      
      expect(container.classList.contains('balance-visualization')).toBe(true);
    });

    it('should initialize with correct structure', () => {
      visualization = new BalanceVisualization(container);
      
      const segments = container.querySelectorAll('.balance-segment');
      expect(segments).toHaveLength(3);
      
      const factSegment = container.querySelector('[data-category="fact"]');
      const opinionSegment = container.querySelector('[data-category="opinion"]');
      const falseSegment = container.querySelector('[data-category="false"]');
      
      expect(factSegment).toBeTruthy();
      expect(opinionSegment).toBeTruthy();
      expect(falseSegment).toBeTruthy();
    });
  });

  describe('rendering analysis results', () => {
    beforeEach(() => {
      visualization = new BalanceVisualization(container, { animated: false });
    });

    it('should render analysis result correctly', () => {
      visualization.render(mockAnalysisResult);
      
      const factSegment = container.querySelector('[data-category="fact"]') as HTMLElement;
      const opinionSegment = container.querySelector('[data-category="opinion"]') as HTMLElement;
      const falseSegment = container.querySelector('[data-category="false"]') as HTMLElement;
      
      expect(factSegment.style.width).toBe('60%');
      expect(opinionSegment.style.width).toBe('25%');
      expect(falseSegment.style.width).toBe('15%');
    });

    it('should update segment percentages', () => {
      visualization.render(mockAnalysisResult);
      
      const factPercentage = container.querySelector('[data-category="fact"] .segment-percentage');
      const opinionPercentage = container.querySelector('[data-category="opinion"] .segment-percentage');
      const falsePercentage = container.querySelector('[data-category="false"] .segment-percentage');
      
      expect(factPercentage?.textContent).toBe('60%');
      expect(opinionPercentage?.textContent).toBe('25%');
      expect(falsePercentage?.textContent).toBe('15%');
    });

    it('should update credibility score', () => {
      visualization.render(mockAnalysisResult);
      
      const scoreValue = container.querySelector('.score-value');
      const confidenceValue = container.querySelector('.confidence-value');
      
      expect(scoreValue?.textContent).toBe('75/100');
      expect(confidenceValue?.textContent).toBe('85%');
    });

    it('should apply correct credibility level class', () => {
      // Test high credibility
      visualization.render(mockAnalysisResult);
      expect(container.classList.contains('high-credibility')).toBe(true);
      
      // Test medium credibility
      const mediumResult = { ...mockAnalysisResult, credibilityScore: 50 };
      visualization.render(mediumResult);
      expect(container.classList.contains('medium-credibility')).toBe(true);
      expect(container.classList.contains('high-credibility')).toBe(false);
      
      // Test low credibility
      const lowResult = { ...mockAnalysisResult, credibilityScore: 20 };
      visualization.render(lowResult);
      expect(container.classList.contains('low-credibility')).toBe(true);
      expect(container.classList.contains('medium-credibility')).toBe(false);
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      visualization = new BalanceVisualization(container);
    });

    it('should show loading state', () => {
      visualization.showLoadingState();
      
      expect(container.classList.contains('loading')).toBe(true);
      
      const segments = container.querySelectorAll('.balance-segment');
      segments.forEach(segment => {
        expect((segment as HTMLElement).style.width).toBe('33.33%');
        expect(segment.querySelector('.segment-percentage')?.textContent).toBe('...');
      });
      
      expect(container.querySelector('.score-value')?.textContent).toBe('...');
      expect(container.querySelector('.confidence-value')?.textContent).toBe('...');
    });

    it('should hide loading state', () => {
      visualization.showLoadingState();
      visualization.hideLoadingState();
      
      expect(container.classList.contains('loading')).toBe(false);
    });

    it('should show error state', () => {
      const errorMessage = 'Analysis failed';
      visualization.showErrorState(errorMessage);
      
      expect(container.classList.contains('error')).toBe(true);
      expect(container.querySelector('.error-text')?.textContent).toBe(errorMessage);
    });

    it('should reset to initial state', () => {
      visualization.showLoadingState();
      visualization.render(mockAnalysisResult);
      visualization.reset();
      
      expect(container.classList.contains('loading')).toBe(false);
      expect(container.classList.contains('high-credibility')).toBe(false);
      expect(container.querySelector('.balance-header')).toBeTruthy();
    });
  });

  describe('animation handling', () => {
    it('should handle animated rendering', () => {
      visualization = new BalanceVisualization(container, { animated: true });
      visualization.render(mockAnalysisResult);
      
      const factSegment = container.querySelector('[data-category="fact"]') as HTMLElement;
      expect(factSegment.style.transition).toContain('width');
    });

    it('should handle non-animated rendering', () => {
      visualization = new BalanceVisualization(container, { animated: false });
      visualization.render(mockAnalysisResult);
      
      const factPercentage = container.querySelector('[data-category="fact"] .segment-percentage');
      expect(factPercentage?.textContent).toBe('60%');
    });
  });

  describe('accessibility and responsive behavior', () => {
    beforeEach(() => {
      visualization = new BalanceVisualization(container);
    });

    it('should hide text for small segments', () => {
      const smallSegmentResult = {
        ...mockAnalysisResult,
        categories: { fact: 85, opinion: 10, false: 5 },
      };
      
      visualization.render(smallSegmentResult);
      
      const falseSegment = container.querySelector('[data-category="false"]');
      const label = falseSegment?.querySelector('.segment-label') as HTMLElement;
      const percentage = falseSegment?.querySelector('.segment-percentage') as HTMLElement;
      
      expect(label.style.opacity).toBe('0');
      expect(percentage.style.opacity).toBe('0');
    });

    it('should show text for large segments', () => {
      visualization.render(mockAnalysisResult);
      
      const factSegment = container.querySelector('[data-category="fact"]');
      const label = factSegment?.querySelector('.segment-label') as HTMLElement;
      const percentage = factSegment?.querySelector('.segment-percentage') as HTMLElement;
      
      expect(label.style.opacity).toBe('1');
      expect(percentage.style.opacity).toBe('1');
    });
  });
});