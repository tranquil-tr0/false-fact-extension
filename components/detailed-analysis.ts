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
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Detailed Analysis Results');
    
    const expandId = `expand-toggle-${Math.random().toString(36).substring(2, 9)}`;
    const detailsId = `analysis-details-${Math.random().toString(36).substring(2, 9)}`;
    
    this.container.innerHTML = `
      <div class="analysis-summary">
        <div class="summary-header">
          <h4 id="analysis-details-heading">Analysis Details</h4>
          ${this.options.expandable ? 
            `<button class="expand-toggle" id="${expandId}" aria-expanded="false" aria-controls="${detailsId}" accesskey="d">Show Details</button>` : 
            ''}
        </div>
        <div class="confidence-overview">
          <div class="confidence-item">
            <span class="confidence-label" id="overall-confidence-label">Overall Confidence</span>
            <div class="confidence-bar" role="meter" aria-labelledby="overall-confidence-label" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
              <div class="confidence-fill" style="width: 0%"></div>
              <span class="confidence-text">--</span>
            </div>
          </div>
        </div>
      </div>
      <div class="analysis-details ${this.options.expandable ? 'collapsible' : ''}" id="${detailsId}" ${this.options.expandable ? 'aria-hidden="true"' : ''} tabindex="${this.options.expandable ? '-1' : '0'}">
        <div class="reasoning-section">
          <h5 id="reasoning-heading">Analysis Reasoning</h5>
          <div class="reasoning-content" aria-labelledby="reasoning-heading">
            <p class="reasoning-text">No analysis available</p>
          </div>
        </div>
        <div class="category-breakdown">
          <h5 id="category-breakdown-heading">Category Breakdown</h5>
          <div class="category-details" role="group" aria-labelledby="category-breakdown-heading">
            <div class="category-item factuality-category">
              <div class="category-header">
                <span class="category-name" id="factuality-category-label">Factuality Content</span>
                <span class="category-percentage" aria-labelledby="factuality-category-label">--</span>
              </div>
              <div class="category-confidence">
                <div class="confidence-indicator" role="meter" aria-label="Factuality content confidence level" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                  <div class="confidence-dots">
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                  </div>
                </div>
              </div>
            </div>
            <div class="category-item objectivity-category">
              <div class="category-header">
                <span class="category-name" id="objectivity-category-label">Objectivity Content</span>
                <span class="category-percentage" aria-labelledby="objectivity-category-label">--</span>
              </div>
              <div class="category-confidence">
                <div class="confidence-indicator" role="meter" aria-label="Objectivity content confidence level" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                  <div class="confidence-dots">
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                    <span class="dot" aria-hidden="true"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="analysis-metadata">
          <h5 id="analysis-info-heading">Analysis Information</h5>
          <div class="metadata-grid" role="group" aria-labelledby="analysis-info-heading">
            <div class="metadata-item">
              <span class="metadata-label" id="analysis-time-label">Analysis Time</span>
              <span class="metadata-value analysis-time" aria-labelledby="analysis-time-label">--</span>
            </div>
            <div class="metadata-item">
              <span class="metadata-label" id="content-hash-label">Content Hash</span>
              <span class="metadata-value content-hash" aria-labelledby="content-hash-label">--</span>
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
      detailsSection.setAttribute('aria-hidden', 'false');
      
      // Make the details section focusable and focus it for keyboard users
      detailsSection.setAttribute('tabindex', '0');
      detailsSection.focus();
      
      // Announce to screen readers that details are now expanded
      const liveRegion = this.getOrCreateLiveRegion();
      liveRegion.textContent = 'Analysis details expanded';
      setTimeout(() => { liveRegion.textContent = ''; }, 1000);
    } else {
      detailsSection.classList.remove('expanded');
      expandToggle.textContent = 'Show Details';
      expandToggle.setAttribute('aria-expanded', 'false');
      detailsSection.setAttribute('aria-hidden', 'true');
      detailsSection.setAttribute('tabindex', '-1');
      
      // Return focus to the toggle button
      expandToggle.focus();
      
      // Announce to screen readers that details are now collapsed
      const liveRegion = this.getOrCreateLiveRegion();
      liveRegion.textContent = 'Analysis details collapsed';
      setTimeout(() => { liveRegion.textContent = ''; }, 1000);
    }
  }
  
  /**
   * Creates or returns a live region for screen reader announcements
   */
  private getOrCreateLiveRegion(): HTMLElement {
    let liveRegion = document.getElementById('detailed-analysis-live-region');
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'detailed-analysis-live-region';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.style.position = 'absolute';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.padding = '0';
      liveRegion.style.margin = '-1px';
      liveRegion.style.overflow = 'hidden';
      // Use clipPath instead of deprecated clip property
      liveRegion.style.clipPath = 'inset(100%)';
      liveRegion.style.whiteSpace = 'nowrap';
      liveRegion.style.border = '0';
      document.body.appendChild(liveRegion);
    }
    
    return liveRegion;
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

  private updateReasoning(reasoning: { factual: string[]; unfactual: string[]; subjective: string[]; objective: string[] }): void {
    const reasoningText = this.container.querySelector('.reasoning-text') as HTMLElement;
    
    if (reasoningText) {
      // Combine all reasoning categories into a formatted string
      let displayText = this.combineReasoningCategories(reasoning);
      
      // Truncate if too long and expandable is enabled
      if (this.options.expandable && displayText.length > this.options.maxReasoningLength) {
        displayText = displayText.substring(0, this.options.maxReasoningLength) + '...';
      }
      
      // Format the text with basic markdown-like formatting
      displayText = this.formatReasoningText(displayText);
      reasoningText.innerHTML = displayText;
    }
  }

  private combineReasoningCategories(reasoning: { factual: string[]; unfactual: string[]; subjective: string[]; objective: string[] }): string {
    const sections: Array<{title: string, items: string[]}> = [
      { title: 'Factual Points', items: reasoning.factual || [] },
      { title: 'Unfactual Points', items: reasoning.unfactual || [] },
      { title: 'Subjective Content', items: reasoning.subjective || [] },
      { title: 'Objective Content', items: reasoning.objective || [] }
    ];
    
    return sections
      .filter(section => section.items.length > 0)
      .map(section => {
        const items = section.items.join('\n• ');
        return `**${section.title}**\n• ${items}`;
      })
      .join('\n\n');
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

  private updateCategoryBreakdown(categories: { factuality: number; objectivity: number }, confidence: number): void {
    this.updateCategoryItem('factuality', categories.factuality, confidence);
    this.updateCategoryItem('objectivity', categories.objectivity, confidence);
  }

  private updateCategoryItem(category: 'factuality' | 'objectivity', percentage: number, confidence: number): void {
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