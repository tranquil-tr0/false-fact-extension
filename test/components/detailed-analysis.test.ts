/**
 * Tests for the detailed analysis display component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DetailedAnalysis } from '../../components/detailed-analysis.js';
import { AnalysisResult } from '../../types/models.js';

describe('DetailedAnalysis', () => {
  let container: HTMLElement;
  let detailedAnalysis: DetailedAnalysis;
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
      reasoning: 'This article contains **factual information** with some *opinion-based* content. The claims are well-sourced and verifiable.',
      timestamp: Date.now(),
      contentHash: 'abcd1234efgh5678',
    };
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create detailed analysis with default options', () => {
      detailedAnalysis = new DetailedAnalysis(container);
      
      expect(container.classList.contains('detailed-analysis')).toBe(true);
      expect(container.querySelector('.analysis-summary')).toBeTruthy();
      expect(container.querySelector('.analysis-details')).toBeTruthy();
      expect(container.querySelector('.expand-toggle')).toBeTruthy();
    });

    it('should create detailed analysis with custom options', () => {
      detailedAnalysis = new DetailedAnalysis(container, {
        expandable: false,
        showConfidenceIndicators: false,
        maxReasoningLength: 100,
      });
      
      expect(container.classList.contains('detailed-analysis')).toBe(true);
      expect(container.querySelector('.expand-toggle')).toBeFalsy();
    });

    it('should initialize with correct structure', () => {
      detailedAnalysis = new DetailedAnalysis(container);
      
      expect(container.querySelector('.confidence-overview')).toBeTruthy();
      expect(container.querySelector('.reasoning-section')).toBeTruthy();
      expect(container.querySelector('.category-breakdown')).toBeTruthy();
      expect(container.querySelector('.analysis-metadata')).toBeTruthy();
      
      const categoryItems = container.querySelectorAll('.category-item');
      expect(categoryItems).toHaveLength(3);
    });
  });

  describe('rendering analysis results', () => {
    beforeEach(() => {
      detailedAnalysis = new DetailedAnalysis(container);
    });

    it('should render analysis result correctly', () => {
      detailedAnalysis.render(mockAnalysisResult);
      
      const confidenceFill = container.querySelector('.confidence-fill') as HTMLElement;
      const confidenceText = container.querySelector('.confidence-text') as HTMLElement;
      
      expect(confidenceFill.style.width).toBe('85%');
      expect(confidenceText.textContent).toBe('85%');
    });

    it('should update reasoning with formatting', () => {
      detailedAnalysis.render(mockAnalysisResult);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.innerHTML).toContain('<strong>factual information</strong>');
      expect(reasoningText.innerHTML).toContain('<em>opinion-based</em>');
    });

    it('should update category percentages', () => {
      detailedAnalysis.render(mockAnalysisResult);
      
      const factPercentage = container.querySelector('.fact-category .category-percentage');
      const opinionPercentage = container.querySelector('.opinion-category .category-percentage');
      const falsePercentage = container.querySelector('.false-category .category-percentage');
      
      expect(factPercentage?.textContent).toBe('60%');
      expect(opinionPercentage?.textContent).toBe('25%');
      expect(falsePercentage?.textContent).toBe('15%');
    });

    it('should update confidence indicators', () => {
      detailedAnalysis = new DetailedAnalysis(container, { showConfidenceIndicators: true });
      detailedAnalysis.render(mockAnalysisResult);
      
      const factDots = container.querySelectorAll('.fact-category .confidence-dots .dot');
      const filledFactDots = container.querySelectorAll('.fact-category .confidence-dots .dot.filled');
      
      expect(factDots.length).toBe(5);
      expect(filledFactDots.length).toBeGreaterThan(0);
    });

    it('should update metadata correctly', () => {
      detailedAnalysis.render(mockAnalysisResult);
      
      const analysisTime = container.querySelector('.analysis-time') as HTMLElement;
      const contentHash = container.querySelector('.content-hash') as HTMLElement;
      
      expect(analysisTime.textContent).toBeTruthy();
      expect(contentHash.textContent).toBe('abcd1234...');
    });

    it('should apply correct confidence level classes', () => {
      // Test high confidence
      detailedAnalysis.render(mockAnalysisResult);
      const confidenceBar = container.querySelector('.confidence-bar') as HTMLElement;
      expect(confidenceBar.classList.contains('high-confidence')).toBe(true);
      
      // Test medium confidence
      const mediumResult = { ...mockAnalysisResult, confidence: 65 };
      detailedAnalysis.render(mediumResult);
      expect(confidenceBar.classList.contains('medium-confidence')).toBe(true);
      expect(confidenceBar.classList.contains('high-confidence')).toBe(false);
      
      // Test low confidence
      const lowResult = { ...mockAnalysisResult, confidence: 45 };
      detailedAnalysis.render(lowResult);
      expect(confidenceBar.classList.contains('low-confidence')).toBe(true);
      expect(confidenceBar.classList.contains('medium-confidence')).toBe(false);
    });
  });

  describe('expandable functionality', () => {
    beforeEach(() => {
      detailedAnalysis = new DetailedAnalysis(container, { expandable: true });
    });

    it('should start in collapsed state', () => {
      const detailsSection = container.querySelector('.analysis-details') as HTMLElement;
      const expandToggle = container.querySelector('.expand-toggle') as HTMLElement;
      
      expect(detailsSection.classList.contains('collapsible')).toBe(true);
      expect(detailsSection.classList.contains('expanded')).toBe(false);
      expect(expandToggle.textContent).toBe('Show Details');
      expect(expandToggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('should expand when toggle is clicked', () => {
      const expandToggle = container.querySelector('.expand-toggle') as HTMLButtonElement;
      const detailsSection = container.querySelector('.analysis-details') as HTMLElement;
      
      expandToggle.click();
      
      expect(detailsSection.classList.contains('expanded')).toBe(true);
      expect(expandToggle.textContent).toBe('Hide Details');
      expect(expandToggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('should collapse when toggle is clicked again', () => {
      const expandToggle = container.querySelector('.expand-toggle') as HTMLButtonElement;
      const detailsSection = container.querySelector('.analysis-details') as HTMLElement;
      
      // Expand first
      expandToggle.click();
      expect(detailsSection.classList.contains('expanded')).toBe(true);
      
      // Then collapse
      expandToggle.click();
      expect(detailsSection.classList.contains('expanded')).toBe(false);
      expect(expandToggle.textContent).toBe('Show Details');
    });

    it('should provide programmatic expand/collapse methods', () => {
      const detailsSection = container.querySelector('.analysis-details') as HTMLElement;
      
      detailedAnalysis.expand();
      expect(detailsSection.classList.contains('expanded')).toBe(true);
      
      detailedAnalysis.collapse();
      expect(detailsSection.classList.contains('expanded')).toBe(false);
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      detailedAnalysis = new DetailedAnalysis(container);
    });

    it('should show loading state', () => {
      detailedAnalysis.showLoadingState();
      
      expect(container.classList.contains('loading')).toBe(true);
      
      const confidenceText = container.querySelector('.confidence-text') as HTMLElement;
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      const percentages = container.querySelectorAll('.category-percentage');
      
      expect(confidenceText.textContent).toBe('...');
      expect(reasoningText.textContent).toBe('Analyzing content...');
      percentages.forEach(el => {
        expect((el as HTMLElement).textContent).toBe('...');
      });
    });

    it('should hide loading state', () => {
      detailedAnalysis.showLoadingState();
      detailedAnalysis.hideLoadingState();
      
      expect(container.classList.contains('loading')).toBe(false);
    });

    it('should show error state', () => {
      const errorMessage = 'Analysis failed';
      detailedAnalysis.showErrorState(errorMessage);
      
      expect(container.classList.contains('error')).toBe(true);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.innerHTML).toContain(errorMessage);
      expect(reasoningText.innerHTML).toContain('error-message');
    });

    it('should reset to initial state', () => {
      detailedAnalysis.showLoadingState();
      detailedAnalysis.render(mockAnalysisResult);
      detailedAnalysis.reset();
      
      expect(container.classList.contains('loading')).toBe(false);
      expect(container.classList.contains('error')).toBe(false);
      expect(container.querySelector('.analysis-summary')).toBeTruthy();
    });
  });

  describe('text formatting', () => {
    beforeEach(() => {
      detailedAnalysis = new DetailedAnalysis(container);
    });

    it('should format bold text', () => {
      const resultWithBold = {
        ...mockAnalysisResult,
        reasoning: 'This is **bold text** in the reasoning.',
      };
      
      detailedAnalysis.render(resultWithBold);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.innerHTML).toContain('<strong>bold text</strong>');
    });

    it('should format italic text', () => {
      const resultWithItalic = {
        ...mockAnalysisResult,
        reasoning: 'This is *italic text* in the reasoning.',
      };
      
      detailedAnalysis.render(resultWithItalic);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.innerHTML).toContain('<em>italic text</em>');
    });

    it('should handle line breaks', () => {
      const resultWithBreaks = {
        ...mockAnalysisResult,
        reasoning: 'First line\nSecond line\n\nNew paragraph',
      };
      
      detailedAnalysis.render(resultWithBreaks);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.innerHTML).toContain('<br>');
      expect(reasoningText.innerHTML).toContain('</p><p>');
    });

    it('should truncate long reasoning when expandable', () => {
      const longReasoning = 'A'.repeat(500);
      const resultWithLongReasoning = {
        ...mockAnalysisResult,
        reasoning: longReasoning,
      };
      
      detailedAnalysis = new DetailedAnalysis(container, { 
        expandable: true, 
        maxReasoningLength: 100 
      });
      detailedAnalysis.render(resultWithLongReasoning);
      
      const reasoningText = container.querySelector('.reasoning-text') as HTMLElement;
      expect(reasoningText.textContent?.length).toBeLessThan(longReasoning.length);
      expect(reasoningText.textContent).toContain('...');
    });
  });

  describe('confidence calculation', () => {
    beforeEach(() => {
      detailedAnalysis = new DetailedAnalysis(container, { showConfidenceIndicators: true });
    });

    it('should show more confidence dots for dominant categories', () => {
      const dominantFactResult = {
        ...mockAnalysisResult,
        categories: { fact: 80, opinion: 15, false: 5 },
        confidence: 90,
      };
      
      detailedAnalysis.render(dominantFactResult);
      
      const factFilledDots = container.querySelectorAll('.fact-category .confidence-dots .dot.filled');
      const falseFilledDots = container.querySelectorAll('.false-category .confidence-dots .dot.filled');
      
      expect(factFilledDots.length).toBeGreaterThan(falseFilledDots.length);
    });

    it('should show fewer confidence dots for minor categories', () => {
      const minorFalseResult = {
        ...mockAnalysisResult,
        categories: { fact: 85, opinion: 10, false: 5 },
        confidence: 80,
      };
      
      detailedAnalysis.render(minorFalseResult);
      
      const factFilledDots = container.querySelectorAll('.fact-category .confidence-dots .dot.filled');
      const falseFilledDots = container.querySelectorAll('.false-category .confidence-dots .dot.filled');
      
      expect(falseFilledDots.length).toBeLessThan(factFilledDots.length);
    });
  });
});