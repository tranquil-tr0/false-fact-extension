/**
 * Tooltip utility for providing contextual help and guidance
 */

export interface TooltipOptions {
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  delay?: number;
  maxWidth?: number;
  theme?: 'dark' | 'light';
  persistent?: boolean;
  interactive?: boolean;
}

export class Tooltip {
  private element: HTMLElement;
  private tooltip: HTMLElement | null = null;
  private options: Required<TooltipOptions>;
  private showTimeout: number | null = null;
  private hideTimeout: number | null = null;
  private isVisible = false;

  constructor(element: HTMLElement, content: string, options: TooltipOptions = {}) {
    this.element = element;
    this.options = {
      position: options.position ?? 'auto',
      delay: options.delay ?? 500,
      maxWidth: options.maxWidth ?? 250,
      theme: options.theme ?? 'dark',
      persistent: options.persistent ?? false,
      interactive: options.interactive ?? false
    };

    this.createTooltip(content);
    this.attachEventListeners();
  }

  private createTooltip(content: string): void {
    this.tooltip = document.createElement('div');
    this.tooltip.className = `tooltip tooltip-${this.options.theme}`;
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.setAttribute('aria-hidden', 'true');
    this.tooltip.style.maxWidth = `${this.options.maxWidth}px`;
    this.tooltip.innerHTML = `
      <div class="tooltip-content">${content}</div>
      <div class="tooltip-arrow"></div>
    `;

    // Add to document but keep hidden
    document.body.appendChild(this.tooltip);
  }

  private attachEventListeners(): void {
    // Mouse events
    this.element.addEventListener('mouseenter', this.handleMouseEnter.bind(this));
    this.element.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    // Focus events for keyboard accessibility
    this.element.addEventListener('focus', this.handleFocus.bind(this));
    this.element.addEventListener('blur', this.handleBlur.bind(this));

    // Touch events for mobile
    this.element.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.element.addEventListener('touchend', this.handleTouchEnd.bind(this));

    if (this.options.interactive && this.tooltip) {
      this.tooltip.addEventListener('mouseenter', this.handleTooltipMouseEnter.bind(this));
      this.tooltip.addEventListener('mouseleave', this.handleTooltipMouseLeave.bind(this));
    }
  }

  private handleMouseEnter(): void {
    this.clearHideTimeout();
    this.showWithDelay();
  }

  private handleMouseLeave(): void {
    if (!this.options.interactive) {
      this.hideWithDelay();
    }
  }

  private handleFocus(): void {
    this.clearHideTimeout();
    this.show();
  }

  private handleBlur(): void {
    this.hide();
  }

  private handleTouchStart(): void {
    this.clearHideTimeout();
    this.show();
  }

  private handleTouchEnd(): void {
    if (!this.options.persistent) {
      this.hideWithDelay(2000); // Longer delay for touch
    }
  }

  private handleTooltipMouseEnter(): void {
    this.clearHideTimeout();
  }

  private handleTooltipMouseLeave(): void {
    this.hideWithDelay();
  }

  private showWithDelay(): void {
    this.clearShowTimeout();
    this.showTimeout = window.setTimeout(() => {
      this.show();
    }, this.options.delay);
  }

  private show(): void {
    if (!this.tooltip || this.isVisible) return;

    this.clearShowTimeout();
    this.isVisible = true;

    // Position the tooltip
    this.positionTooltip();

    // Show with animation
    this.tooltip.classList.add('tooltip-visible');
    this.tooltip.setAttribute('aria-hidden', 'false');

    // Add ARIA relationship
    const tooltipId = `tooltip-${Math.random().toString(36).substring(2, 9)}`;
    this.tooltip.id = tooltipId;
    this.element.setAttribute('aria-describedby', tooltipId);
  }

  private hideWithDelay(delay?: number): void {
    this.clearHideTimeout();
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, delay ?? 200);
  }

  private hide(): void {
    if (!this.tooltip || !this.isVisible) return;

    this.clearHideTimeout();
    this.isVisible = false;

    // Hide with animation
    this.tooltip.classList.remove('tooltip-visible');
    this.tooltip.setAttribute('aria-hidden', 'true');

    // Remove ARIA relationship
    this.element.removeAttribute('aria-describedby');
  }

  private positionTooltip(): void {
    if (!this.tooltip) return;

    const elementRect = this.element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let position = this.options.position;

    // Auto-position if needed
    if (position === 'auto') {
      position = this.calculateBestPosition(elementRect, tooltipRect, viewportWidth, viewportHeight);
    }

    const coords = this.calculatePosition(position, elementRect, tooltipRect);

    // Apply position
    this.tooltip.style.left = `${coords.x}px`;
    this.tooltip.style.top = `${coords.y}px`;

    // Update arrow position
    this.updateArrowPosition(position);
  }

  private calculateBestPosition(
    elementRect: DOMRect,
    tooltipRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number
  ): 'top' | 'bottom' | 'left' | 'right' {
    const spaceTop = elementRect.top;
    const spaceBottom = viewportHeight - elementRect.bottom;
    const spaceLeft = elementRect.left;
    const spaceRight = viewportWidth - elementRect.right;

    // Prefer top/bottom positions
    if (spaceTop >= tooltipRect.height + 10) return 'top';
    if (spaceBottom >= tooltipRect.height + 10) return 'bottom';
    if (spaceRight >= tooltipRect.width + 10) return 'right';
    if (spaceLeft >= tooltipRect.width + 10) return 'left';

    // Fallback to position with most space
    const maxSpace = Math.max(spaceTop, spaceBottom, spaceLeft, spaceRight);
    if (maxSpace === spaceTop) return 'top';
    if (maxSpace === spaceBottom) return 'bottom';
    if (maxSpace === spaceRight) return 'right';
    return 'left';
  }

  private calculatePosition(
    position: 'top' | 'bottom' | 'left' | 'right',
    elementRect: DOMRect,
    tooltipRect: DOMRect
  ): { x: number; y: number } {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const gap = 8; // Gap between element and tooltip

    switch (position) {
      case 'top':
        return {
          x: scrollX + elementRect.left + (elementRect.width - tooltipRect.width) / 2,
          y: scrollY + elementRect.top - tooltipRect.height - gap
        };
      case 'bottom':
        return {
          x: scrollX + elementRect.left + (elementRect.width - tooltipRect.width) / 2,
          y: scrollY + elementRect.bottom + gap
        };
      case 'left':
        return {
          x: scrollX + elementRect.left - tooltipRect.width - gap,
          y: scrollY + elementRect.top + (elementRect.height - tooltipRect.height) / 2
        };
      case 'right':
        return {
          x: scrollX + elementRect.right + gap,
          y: scrollY + elementRect.top + (elementRect.height - tooltipRect.height) / 2
        };
    }
  }

  private updateArrowPosition(position: 'top' | 'bottom' | 'left' | 'right'): void {
    if (!this.tooltip) return;

    const arrow = this.tooltip.querySelector('.tooltip-arrow') as HTMLElement;
    if (!arrow) return;

    arrow.className = 'tooltip-arrow';
    let arrowClass = '';
    switch (position) {
      case 'top':
        arrowClass = 'tooltip-arrow-bottom';
        break;
      case 'bottom':
        arrowClass = 'tooltip-arrow-top';
        break;
      case 'left':
        arrowClass = 'tooltip-arrow-right';
        break;
      case 'right':
        arrowClass = 'tooltip-arrow-left';
        break;
    }
    arrow.classList.add(arrowClass);
  }

  private clearShowTimeout(): void {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
  }

  private clearHideTimeout(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  public updateContent(content: string): void {
    if (this.tooltip) {
      const contentElement = this.tooltip.querySelector('.tooltip-content');
      if (contentElement) {
        contentElement.innerHTML = content;
      }
    }
  }

  public destroy(): void {
    this.hide();
    this.clearShowTimeout();
    this.clearHideTimeout();

    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }

  }
}

// Utility function to create tooltips easily
export function createTooltip(element: HTMLElement, content: string, options?: TooltipOptions): Tooltip {
  return new Tooltip(element, content, options);
}

// Utility function to add tooltips to multiple elements
export function addTooltips(elements: NodeListOf<HTMLElement> | HTMLElement[], content: string | ((element: HTMLElement) => string), options?: TooltipOptions): Tooltip[] {
  const tooltips: Tooltip[] = [];
  
  elements.forEach((element) => {
    const tooltipContent = typeof content === 'function' ? content(element) : content;
    tooltips.push(new Tooltip(element, tooltipContent, options));
  });
  
  return tooltips;
}