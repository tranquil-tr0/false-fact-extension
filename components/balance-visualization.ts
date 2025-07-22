/**
 * Balance visualization component for displaying fact/opinion/false percentages
 */

import { AnalysisResult } from '../types/models.js';

export interface BalanceVisualizationOptions {
  width?: number;
  height?: number;
  showLabels?: boolean;
  showPercentages?: boolean;
  animated?: boolean;
}

export class BalanceVisualization {
  private container: HTMLElement;
  private options: Required<BalanceVisualizationOptions>;
  private animationDuration = 800; // ms

  constructor(container: HTMLElement, options: BalanceVisualizationOptions = {}) {
    this.container = container;
    this.options = {
      width: options.width ?? 300,
      height: options.height ?? 60,
      showLabels: options.showLabels ?? true,
      showPercentages: options.showPercentages ?? true,
      animated: options.animated ?? true,
    };
    
    this.initializeContainer();
  }

  private initializeContainer(): void {
    this.container.className = 'balance-visualization';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Credibility Analysis Visualization');
    this.container.innerHTML = `
      <div class="balance-header">
        <h3 id="balance-visualization-title">Credibility Analysis</h3>
      </div>
      <div class="balance-bar-container">
        <div class="balance-bar" role="group" aria-labelledby="balance-visualization-title">
          <div class="balance-segment fact-segment" data-category="fact" role="meter" aria-label="Factual content percentage" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <span class="segment-label">Fact</span>
            <span class="segment-percentage">0%</span>
          </div>
          <div class="balance-segment opinion-segment" data-category="opinion" role="meter" aria-label="Opinion content percentage" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <span class="segment-label">Opinion</span>
            <span class="segment-percentage">0%</span>
          </div>
          <div class="balance-segment false-segment" data-category="false" role="meter" aria-label="False content percentage" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <span class="segment-label">False</span>
            <span class="segment-percentage">0%</span>
          </div>
        </div>
      </div>
      <div class="credibility-score">
        <div class="score-label" id="credibility-score-label">Overall Credibility</div>
        <div class="score-value" role="meter" aria-labelledby="credibility-score-label" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">--</div>
        <div class="confidence-indicator">
          <span class="confidence-label" id="confidence-label">Confidence:</span>
          <span class="confidence-value" role="meter" aria-labelledby="confidence-label" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">--</span>
        </div>
      </div>
    `;
  }

  public render(analysisResult: AnalysisResult): void {
    const { categories, credibilityScore, confidence } = analysisResult;
    
    // Update segment widths and labels
    this.updateSegment('fact', categories.fact);
    this.updateSegment('opinion', categories.opinion);
    this.updateSegment('false', categories.false);
    
    // Update overall credibility score
    this.updateCredibilityScore(credibilityScore, confidence);
    
    // Add credibility level class for styling
    this.updateCredibilityLevel(credibilityScore);
  }

  private updateSegment(category: 'fact' | 'opinion' | 'false', percentage: number): void {
    const segment = this.container.querySelector(`[data-category="${category}"]`) as HTMLElement;
    if (!segment) return;

    const percentageElement = segment.querySelector('.segment-percentage') as HTMLElement;
    const labelElement = segment.querySelector('.segment-label') as HTMLElement;

    // Update ARIA attributes for accessibility
    segment.setAttribute('aria-valuenow', Math.round(percentage).toString());
    
    if (this.options.animated) {
      // Animate width change
      segment.style.transition = `width ${this.animationDuration}ms ease-out`;
      
      // Animate percentage counter
      this.animatePercentage(percentageElement, percentage);
    } else {
      percentageElement.textContent = `${Math.round(percentage)}%`;
    }

    // Set width as percentage of total
    segment.style.width = `${percentage}%`;
    
    // Hide label and percentage if segment is too small, but keep accessible for screen readers
    const shouldHideText = percentage < 15;
    labelElement.style.opacity = shouldHideText ? '0' : '1';
    percentageElement.style.opacity = shouldHideText ? '0' : '1';
    
    // Even if visually hidden, ensure screen readers can access the information
    if (shouldHideText) {
      const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
      segment.setAttribute('aria-label', `${categoryName} content: ${Math.round(percentage)}%`);
    }
  }

  private animatePercentage(element: HTMLElement, targetPercentage: number): void {
    const startValue = 0;
    const duration = this.animationDuration;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (targetPercentage - startValue) * easeOutCubic;
      
      element.textContent = `${Math.round(currentValue)}%`;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private updateCredibilityScore(score: number, confidence: number): void {
    const scoreElement = this.container.querySelector('.score-value') as HTMLElement;
    const confidenceElement = this.container.querySelector('.confidence-value') as HTMLElement;

    // Update ARIA attributes for accessibility
    scoreElement.setAttribute('aria-valuenow', Math.round(score).toString());
    confidenceElement.setAttribute('aria-valuenow', Math.round(confidence).toString());

    if (this.options.animated) {
      this.animateScore(scoreElement, score);
      this.animateScore(confidenceElement, confidence, '%');
    } else {
      scoreElement.textContent = `${Math.round(score)}/100`;
      confidenceElement.textContent = `${Math.round(confidence)}%`;
    }
    
    // Add a descriptive label for screen readers based on credibility level
    let credibilityDescription = '';
    if (score >= 80) {
      credibilityDescription = 'High credibility';
    } else if (score >= 60) {
      credibilityDescription = 'Moderate credibility';
    } else if (score >= 40) {
      credibilityDescription = 'Low credibility';
    } else {
      credibilityDescription = 'Very low credibility';
    }
    
    scoreElement.setAttribute('aria-label', `Overall credibility score: ${Math.round(score)} out of 100. ${credibilityDescription}`);
  }

  private animateScore(element: HTMLElement, targetValue: number, suffix: string = '/100'): void {
    const startValue = 0;
    const duration = this.animationDuration;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      const currentValue = startValue + (targetValue - startValue) * easeOutCubic;
      
      element.textContent = `${Math.round(currentValue)}${suffix}`;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }

  private updateCredibilityLevel(score: number): void {
    // Remove existing credibility level classes
    this.container.classList.remove('high-credibility', 'medium-credibility', 'low-credibility');
    
    // Add appropriate class based on score
    if (score >= 70) {
      this.container.classList.add('high-credibility');
    } else if (score >= 40) {
      this.container.classList.add('medium-credibility');
    } else {
      this.container.classList.add('low-credibility');
    }
  }

  public showLoadingState(): void {
    this.container.classList.add('loading');
    const segments = this.container.querySelectorAll('.balance-segment');
    segments.forEach(segment => {
      (segment as HTMLElement).style.width = '33.33%';
      segment.querySelector('.segment-percentage')!.textContent = '...';
    });
    
    this.container.querySelector('.score-value')!.textContent = '...';
    this.container.querySelector('.confidence-value')!.textContent = '...';
  }

  public hideLoadingState(): void {
    this.container.classList.remove('loading');
  }

  public showErrorState(message: string = 'Analysis failed'): void {
    this.container.classList.add('error');
    this.container.innerHTML = `
      <div class="error-message">
        <div class="error-icon">⚠️</div>
        <div class="error-text">${message}</div>
      </div>
    `;
  }

  public reset(): void {
    this.container.classList.remove('loading', 'error', 'high-credibility', 'medium-credibility', 'low-credibility');
    this.initializeContainer();
  }
}