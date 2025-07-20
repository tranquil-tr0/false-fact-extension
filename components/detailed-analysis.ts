/**
 * Detailed analysis display component for showing reasoning and confidence scores
 */

import { AnalysisResult } from '../types/models.js';

export interface DetailedAnalysisOptions {
  expandable?: boolean;
  showConfidenceIndicators?: boolean;
  maxReasoningLength?: number;
}

export class DetailedAnalysis {
  private container: HTMLElement;
  private options: Required<DetailedAnalysisOptions>;
  private isExpanded: boolean = false;

  constructor(container: HTMLElement, options: DetailedAnalysisOptions = {}) {
    this.container = container;
    this.options = {
      expandable: options.expandable ?? true,
      showConfidenceIndicators: options.showConfidenceIndicators ?? true,
      maxReasoningLength: options.maxReasoningLength ?? 300,
    };
    
    this.initializeContainer();
  }

  private initializeContainer(): void {
    this.container.className = 'detailed-analysis';
    this.container.innerHTML = `
      <div class="analysis-summary">
        <div class="summary-header">
          <h4>Analysis Details</h4>
          ${this.options.expandable ? '<button class="expand-toggle" aria-expanded="false">Show Details</button>' : ''}
        </div>
        <div class="confidence-overview">
          <div class="confidence-item">
            <span class="confidence-label">Overall Confidence</span>
            <div class="confidence-bar">
              <div class="confidence-fill" style="width: 0%"></div>
              <span class="confidence-text">--</span>
            </div>
          </div>
        </div>
      </div>
      <div class="analysis-details ${this.options.expandable ? 'collapsible' : ''}">
        <div class="reasoning-section">
          <h5>Analysis Reasoning</h5>
          <div class="reasoning-content">
            <p class="reasoning-text">No analysis available</p>
          </div>
        </div>
        <div class="category-breakdown">
          <h5>Category Breakdown</h5>
          <div class="category-details">
            <div class="category-item fact-category">
              <div class="category-header">
                <span class="category-name">Factual Content</span>
                <span class="category-percentage">--</span>
              </div>
              <div class="category-confidence">
                <div class="confidence-indicator">
                  <div class="confidence-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                </div>
              </div>
            </div>
            <div class="category-item opinion-category">
              <div class="category-header">
                <span class="category-name">Opinion Content</span>
                <span class="category-percentage">--</span>
              </div>
              <div class="category-confidence">
                <div class="confidence-indicator">
                  <div class="confidence-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                </div>
              </div>
            </div>
            <div class="category-item false-category">
              <div class="category-header">
                <span class="category-name">False Content</span>
                <span class="category-percentage">--</span>
              </div>
              <div class="category-confidence">
                <div class="confidence-indicator">
                  <div class="confidence-dots">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="analysis-metadata">
          <h5>Analysis Information</h5>
          <div class="metadata-grid">
            <div class="metadata-item">
              <span class="metadata-label">Analysis Time</span>
              <span class="metadata-value analysis-time">--</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label">Content Hash</span>
              <span class="metadata-value content-hash">--</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.options.expandable) return;

    const expandToggle = this.container.querySelector('.expand-toggle') as HTMLButtonElement;
    const detailsSection = this.container.querySelector('.analysis-details') as HTMLElement;

    if (expandToggle && detailsSection) {
      expandToggle.addEventListener('click', () => {
        this.toggleExpanded();
      });
    }
  }

  private toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
    const expandToggle = this.container.querySelector('.expand-toggle') as HTMLButtonElement;
    const detailsSection = this.container.querySelector('.analysis-details') as HTMLElement;

    if (this.isExpanded) {
      detailsSection.classList.add('expanded');
      expandToggle.textContent = 'Hide Details';
      expandToggle.setAttribute('aria-expanded', 'true');
    } else {
      detailsSection.classList.remove('expanded');
      expandToggle.textContent = 'Show Details';
      expandToggle.setAttribute('aria-expanded', 'false');
    }
  }

  public render(analysisResult: AnalysisResult): void {
    this.updateConfidenceOverview(analysisResult.confidence);
    this.updateReasoning(analysisResult.reasoning);
    this.updateCategoryBreakdown(analysisResult.categories, analysisResult.confidence);
    this.updateMetadata(analysisResult);
  }

  private updateConfidenceOverview(confidence: number): void {
    const confidenceFill = this.container.querySelector('.confidence-fill') as HTMLElement;
    const confidenceText = this.container.querySelector('.confidence-text') as HTMLElement;

    if (confidenceFill && confidenceText) {
      confidenceFill.style.width = `${confidence}%`;
      confidenceText.textContent = `${Math.round(confidence)}%`;
      
      // Add confidence level class
      const confidenceBar = this.container.querySelector('.confidence-bar') as HTMLElement;
      confidenceBar.classList.remove('high-confidence', 'medium-confidence', 'low-confidence');
      
      if (confidence >= 80) {
        confidenceBar.classList.add('high-confidence');
      } else if (confidence >= 60) {
        confidenceBar.classList.add('medium-confidence');
      } else {
        confidenceBar.classList.add('low-confidence');
      }
    }
  }

  private updateReasoning(reasoning: string): void {
    const reasoningText = this.container.querySelector('.reasoning-text') as HTMLElement;
    
    if (reasoningText) {
      let displayText = reasoning;
      
      // Truncate if too long and expandable is enabled
      if (this.options.expandable && reasoning.length > this.options.maxReasoningLength) {
        displayText = reasoning.substring(0, this.options.maxReasoningLength) + '...';
      }
      
      // Format the text with basic markdown-like formatting
      displayText = this.formatReasoningText(displayText);
      reasoningText.innerHTML = displayText;
    }
  }

  private formatReasoningText(text: string): string {
    // Basic text formatting for better readability
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic text
      .replace(/\n\n/g, '</p><p>') // Paragraph breaks
      .replace(/\n/g, '<br>') // Line breaks
      .replace(/^(.*)$/, '<p>$1</p>'); // Wrap in paragraph
  }

  private updateCategoryBreakdown(categories: { fact: number; opinion: number; false: number }, confidence: number): void {
    this.updateCategoryItem('fact', categories.fact, confidence);
    this.updateCategoryItem('opinion', categories.opinion, confidence);
    this.updateCategoryItem('false', categories.false, confidence);
  }

  private updateCategoryItem(category: 'fact' | 'opinion' | 'false', percentage: number, confidence: number): void {
    const categoryItem = this.container.querySelector(`.${category}-category`);
    if (!categoryItem) return;

    const percentageElement = categoryItem.querySelector('.category-percentage') as HTMLElement;
    const confidenceDots = categoryItem.querySelectorAll('.confidence-dots .dot');

    if (percentageElement) {
      percentageElement.textContent = `${Math.round(percentage)}%`;
    }

    if (this.options.showConfidenceIndicators && confidenceDots.length > 0) {
      // Calculate confidence level for this category based on percentage and overall confidence
      const categoryConfidence = this.calculateCategoryConfidence(percentage, confidence);
      const filledDots = Math.round((categoryConfidence / 100) * confidenceDots.length);

      confidenceDots.forEach((dot, index) => {
        const dotElement = dot as HTMLElement;
        if (index < filledDots) {
          dotElement.classList.add('filled');
        } else {
          dotElement.classList.remove('filled');
        }
      });
    }
  }

  private calculateCategoryConfidence(percentage: number, overallConfidence: number): number {
    // Higher percentage categories get higher confidence weighting
    const percentageWeight = percentage / 100;
    const baseConfidence = overallConfidence * percentageWeight;
    
    // Boost confidence for dominant categories
    if (percentage > 50) {
      return Math.min(100, baseConfidence * 1.2);
    } else if (percentage < 10) {
      return Math.max(0, baseConfidence * 0.7);
    }
    
    return baseConfidence;
  }

  private updateMetadata(analysisResult: AnalysisResult): void {
    const analysisTime = this.container.querySelector('.analysis-time') as HTMLElement;
    const contentHash = this.container.querySelector('.content-hash') as HTMLElement;

    if (analysisTime) {
      const date = new Date(analysisResult.timestamp);
      analysisTime.textContent = date.toLocaleString();
    }

    if (contentHash) {
      // Show first 8 characters of hash for reference
      contentHash.textContent = analysisResult.contentHash.substring(0, 8) + '...';
    }
  }

  public showLoadingState(): void {
    this.container.classList.add('loading');
    
    // Show loading placeholders
    const confidenceText = this.container.querySelector('.confidence-text') as HTMLElement;
    const reasoningText = this.container.querySelector('.reasoning-text') as HTMLElement;
    const percentages = this.container.querySelectorAll('.category-percentage');

    if (confidenceText) confidenceText.textContent = '...';
    if (reasoningText) reasoningText.textContent = 'Analyzing content...';
    
    percentages.forEach(el => {
      (el as HTMLElement).textContent = '...';
    });
  }

  public hideLoadingState(): void {
    this.container.classList.remove('loading');
  }

  public showErrorState(message: string = 'Analysis details unavailable'): void {
    this.container.classList.add('error');
    
    const reasoningText = this.container.querySelector('.reasoning-text') as HTMLElement;
    if (reasoningText) {
      reasoningText.innerHTML = `<p class="error-message">${message}</p>`;
    }
  }

  public reset(): void {
    this.container.classList.remove('loading', 'error');
    this.isExpanded = false;
    this.initializeContainer();
  }

  public expand(): void {
    if (this.options.expandable && !this.isExpanded) {
      this.toggleExpanded();
    }
  }

  public collapse(): void {
    if (this.options.expandable && this.isExpanded) {
      this.toggleExpanded();
    }
  }
}