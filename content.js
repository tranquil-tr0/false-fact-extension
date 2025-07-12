// Content script for fact-checking extension
class FactCheckContent {
  constructor() {
    this.overlay = null;
    this.init();
  }
  
  init() {
    // Listen for messages from popup or background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true;
    });
    
    // Add keyboard shortcut for quick fact check
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        this.quickFactCheck();
      }
    });
    
    // Add context menu functionality for selected text
    document.addEventListener('contextmenu', (e) => {
      const selectedText = window.getSelection().toString().trim();
      if (selectedText.length > 20) {
        // Store selected text for potential fact-checking
        this.selectedText = selectedText;
      }
    });
  }
  
  handleMessage(request, sender, sendResponse) {
    switch (request.type) {
      case 'EXTRACT_CONTENT':
        sendResponse(this.extractContent());
        break;
      case 'SHOW_OVERLAY':
        this.showOverlay(request.data);
        sendResponse({ success: true });
        break;
      case 'HIDE_OVERLAY':
        this.hideOverlay();
        sendResponse({ success: true });
        break;
      case 'QUICK_CHECK':
        this.quickFactCheck();
        sendResponse({ success: true });
        break;
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }
  
  extractContent() {
    const title = document.title || '';
    const url = window.location.href;
    
    // Extract main content using various strategies
    let content = this.extractMainContent();
    
    // Extract metadata
    const metadata = this.extractMetadata();
    
    return {
      title,
      content,
      url,
      metadata,
      timestamp: new Date().toISOString()
    };
  }
  
  extractMainContent() {
    // Priority order of content selectors
    const contentSelectors = [
      // News sites
      'article',
      '[role="main"]',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.story-body',
      '.article-body',
      '.content-body',
      
      // Blog platforms
      '.post-body',
      '.blog-content',
      '.entry',
      
      // Generic content
      'main',
      '.content',
      '#content',
      '.main-content'
    ];
    
    // Try each selector
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const text = this.cleanText(element.innerText);
        if (text.length > 200) { // Ensure substantial content
          return text.substring(0, 8000); // Limit to prevent oversized data
        }
      }
    }
    
    // Fallback: extract paragraph content
    const paragraphs = Array.from(document.querySelectorAll('p'))
      .map(p => this.cleanText(p.innerText))
      .filter(text => text.length > 50) // Filter out short paragraphs
      .slice(0, 15); // Limit number of paragraphs
    
    return paragraphs.join(' ').substring(0, 8000);
  }
  
  extractMetadata() {
    const metadata = {};
    
    // Extract publication date
    const dateSelectors = [
      'time[datetime]',
      '.publish-date',
      '.publication-date',
      '.date',
      '[data-date]'
    ];
    
    for (const selector of dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        metadata.publishDate = element.getAttribute('datetime') || 
                              element.getAttribute('data-date') || 
                              element.textContent.trim();
        break;
      }
    }
    
    // Extract author information
    const authorSelectors = [
      '.author',
      '.byline',
      '[rel="author"]',
      '.post-author',
      '.article-author'
    ];
    
    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        metadata.author = this.cleanText(element.textContent);
        break;
      }
    }
    
    // Extract meta tags
    const metaTags = document.querySelectorAll('meta');
    metaTags.forEach(tag => {
      const property = tag.getAttribute('property') || tag.getAttribute('name');
      const content = tag.getAttribute('content');
      
      if (property && content) {
        if (property.includes('author')) {
          metadata.metaAuthor = content;
        } else if (property.includes('published') || property.includes('date')) {
          metadata.metaDate = content;
        } else if (property.includes('description')) {
          metadata.description = content;
        }
      }
    });
    
    return metadata;
  }
  
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
  }
  
  showOverlay(analysisData) {
    // Remove existing overlay
    this.hideOverlay();
    
    // Create overlay element
    this.overlay = document.createElement('div');
    this.overlay.id = 'fact-check-overlay';
    this.overlay.className = 'fact-check-overlay';
    
    // Apply styles
    this.overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      max-width: 90vw;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(20px);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: all 0.3s ease;
      transform: translateX(100%);
      opacity: 0;
    `;
    
    // Create content
    const { assessment, icon, score, issues, positives } = analysisData;
    
    this.overlay.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">${icon}</span>
          <div>
            <div style="font-weight: 600; font-size: 16px;">Fact Check</div>
            <div style="font-size: 12px; opacity: 0.8;">Is This Real?</div>
          </div>
        </div>
        <button id="fact-check-close" style="
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          font-size: 20px;
          cursor: pointer;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        ">×</button>
      </div>
      
      <div style="margin-bottom: 16px;">
        <div style="font-weight: 600; font-size: 16px; margin-bottom: 4px;">
          ${assessment}
        </div>
        <div style="background: rgba(255, 255, 255, 0.2); padding: 8px 12px; border-radius: 8px;">
          <strong>Score: ${score}/100</strong>
        </div>
      </div>
      
      ${this.renderAnalysisDetails(issues, positives)}
      
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.2);">
        <div style="font-size: 11px; opacity: 0.7; text-align: center;">
          Press Ctrl+Shift+F for quick fact check
        </div>
      </div>
    `;
    
    // Add event listeners
    this.overlay.querySelector('#fact-check-close').addEventListener('click', () => {
      this.hideOverlay();
    });
    
    // Add hover effect for close button
    const closeBtn = this.overlay.querySelector('#fact-check-close');
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.3)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    
    // Append to body
    document.body.appendChild(this.overlay);
    
    // Animate in
    requestAnimationFrame(() => {
      this.overlay.style.transform = 'translateX(0)';
      this.overlay.style.opacity = '1';
    });
    
    // Auto-hide after 15 seconds
    setTimeout(() => {
      if (this.overlay && this.overlay.parentNode) {
        this.hideOverlay();
      }
    }, 15000);
  }
  
  renderAnalysisDetails(issues, positives) {
    let html = '';
    
    if (positives && positives.length > 0) {
      html += `
        <div style="margin-bottom: 12px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #10B981;">
            ✅ Positive Indicators
          </div>
          <ul style="margin: 0; padding-left: 16px; font-size: 12px;">
            ${positives.map(p => `<li style="margin-bottom: 2px;">${p}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    if (issues && issues.length > 0) {
      html += `
        <div style="margin-bottom: 12px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 6px; color: #F59E0B;">
            ⚠️ Concerns
          </div>
          <ul style="margin: 0; padding-left: 16px; font-size: 12px;">
            ${issues.map(i => `<li style="margin-bottom: 2px;">${i}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    return html;
  }
  
  hideOverlay() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.style.transform = 'translateX(100%)';
      this.overlay.style.opacity = '0';
      
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.remove();
          this.overlay = null;
        }
      }, 300);
    }
  }
  
  async quickFactCheck() {
    try {
      // Show loading overlay
      this.showLoadingOverlay();
      
      // Extract content
      const content = this.extractContent();
      
      // Send to background for analysis
      const response = await chrome.runtime.sendMessage({
        type: 'QUICK_ANALYZE',
        content: content
      });
      
      if (response && response.analysis) {
        this.showOverlay(response.analysis);
      } else {
        this.showErrorOverlay('Unable to analyze content');
      }
      
    } catch (error) {
      console.error('Quick fact check failed:', error);
      this.showErrorOverlay('Fact check failed');
    }
  }
  
  showLoadingOverlay() {
    this.hideOverlay();
    
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 200px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      text-align: center;
    `;
    
    this.overlay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        "></div>
        <span>Fact checking...</span>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    
    document.body.appendChild(this.overlay);
  }
  
  showErrorOverlay(message) {
    this.hideOverlay();
    
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 250px;
      background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    this.overlay.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 20px;">❌</span>
        <span>${message}</span>
      </div>
    `;
    
    document.body.appendChild(this.overlay);
    
    setTimeout(() => {
      this.hideOverlay();
    }, 3000);
  }
}

// Initialize content script
if (typeof window !== 'undefined') {
  new FactCheckContent();
}
