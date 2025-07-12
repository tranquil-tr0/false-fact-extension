// Popup script for the fact-checking extension
class FactChecker {
  constructor() {
    this.checkBtn = document.getElementById('checkBtn');
    this.statusIcon = document.getElementById('statusIcon');
    this.statusText = document.getElementById('statusText');
    this.details = document.getElementById('details');
    this.error = document.getElementById('error');
    this.settingsBtn = document.getElementById('settingsBtn');
    
    this.init();
  }
  
  init() {
    this.checkBtn.addEventListener('click', () => this.checkCurrentPage());
    this.settingsBtn.addEventListener('click', () => this.openSettings());
    
    // Check if we have a cached result for the current tab
    this.loadCachedResult();
  }
  
  async loadCachedResult() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const result = await chrome.storage.local.get(`result_${tab.url}`);
      
      if (result[`result_${tab.url}`]) {
        this.displayResult(result[`result_${tab.url}`]);
      }
    } catch (error) {
      console.error('Error loading cached result:', error);
    }
  }
  
  async checkCurrentPage() {
    try {
      this.setLoading(true);
      this.hideError();
      // Get the current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url || !tab.url.startsWith('http')) {
        throw new Error('Cannot analyze this page. Extension only works on web pages.');
      }
      // Extract content from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: this.extractPageContent
      });
      const pageContent = results && results[0] ? results[0].result : null;
      if (!pageContent || typeof pageContent.title !== 'string' || typeof pageContent.content !== 'string' || (!pageContent.title && !pageContent.content)) {
        throw new Error('No article content found to analyze on this page.');
      }
      // Analyze the content
      const analysis = await this.analyzeContent(pageContent);
      // Cache the result
      await chrome.storage.local.set({
        [`result_${tab.url}`]: analysis
      });
      this.displayResult(analysis);
    } catch (error) {
      this.showError(error.message);
    } finally {
      this.setLoading(false);
    }
  }
  
  extractPageContent() {
    // This function runs in the content script context
    const title = document.title || '';
    
    // Try to find article content
    let content = '';
    
    // Common article selectors
    const articleSelectors = [
      'article',
      '[role="main"]',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      'main p',
      '.story-body',
      '.article-body'
    ];
    
    for (const selector of articleSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        content = element.innerText.trim();
        if (content.length > 100) break; // Found substantial content
      }
    }
    
    // Fallback: get all paragraph text
    if (!content || content.length < 100) {
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => p.innerText.trim())
        .filter(text => text.length > 50)
        .slice(0, 10); // First 10 substantial paragraphs
      
      content = paragraphs.join(' ');
    }
    
    return {
      title,
      content: content.substring(0, 5000), // Limit content length
      url: window.location.href
    };
  }
  
  async analyzeContent(pageContent) {
    // Simulate AI analysis (in a real implementation, this would call an AI service)
    return new Promise((resolve) => {
      setTimeout(() => {
        // Mock analysis based on content characteristics
        const analysis = this.performMockAnalysis(pageContent);
        resolve(analysis);
      }, 2000); // Simulate API call delay
    });
  }
  
  performMockAnalysis(pageContent) {
    const { title, content, url } = pageContent;
    
    // Simple heuristics for demonstration
    let credibilityScore = 0.5;
    let issues = [];
    let positives = [];
    
    // Check domain reputation (simplified)
    const domain = new URL(url).hostname;
    const trustedDomains = ['reuters.com', 'ap.org', 'bbc.com', 'npr.org', 'cnn.com'];
    const questionableDomains = ['fake-news.com', 'conspiracy-site.net'];
    
    if (trustedDomains.some(d => domain.includes(d))) {
      credibilityScore += 0.3;
      positives.push('Published by a generally trusted news source');
    } else if (questionableDomains.some(d => domain.includes(d))) {
      credibilityScore -= 0.3;
      issues.push('Published by a source with questionable credibility');
    }
    
    // Check for emotional language
    const emotionalWords = ['SHOCKING', 'BREAKING', 'EXCLUSIVE', 'URGENT', 'AMAZING'];
    const emotionalCount = emotionalWords.filter(word => 
      title.toUpperCase().includes(word) || content.toUpperCase().includes(word)
    ).length;
    
    if (emotionalCount > 2) {
      credibilityScore -= 0.2;
      issues.push('Contains excessive emotional or sensational language');
    }
    
    // Check content length
    if (content.length < 200) {
      credibilityScore -= 0.1;
      issues.push('Article appears to be very short or lacks substantial content');
    } else {
      positives.push('Contains substantial content for analysis');
    }
    
    // Check for sources/citations (simplified)
    const hasSources = content.includes('according to') || 
                      content.includes('study shows') ||
                      content.includes('research indicates') ||
                      content.includes('expert') ||
                      content.includes('source');
    
    if (hasSources) {
      credibilityScore += 0.2;
      positives.push('References sources or experts');
    } else {
      issues.push('Limited or no references to sources');
    }
    
    // Determine overall assessment
    let assessment;
    let icon;
    
    if (credibilityScore >= 0.7) {
      assessment = 'Likely Reliable';
      icon = '✅';
    } else if (credibilityScore >= 0.4) {
      assessment = 'Questionable';
      icon = '⚠️';
    } else {
      assessment = 'Likely Unreliable';
      icon = '❌';
    }
    
    return {
      assessment,
      icon,
      score: Math.round(credibilityScore * 100),
      issues,
      positives,
      analyzedAt: new Date().toISOString()
    };
  }
  
  displayResult(result) {
    this.statusIcon.textContent = result.icon;
    this.statusText.textContent = result.assessment;
    
    let detailsHTML = `
      <div style="margin-bottom: 12px;">
        <strong>Credibility Score: ${result.score}/100</strong>
      </div>
    `;
    
    if (result.positives.length > 0) {
      detailsHTML += `
        <div style="margin-bottom: 12px;">
          <strong>✅ Positive Indicators:</strong>
          <ul style="margin: 4px 0; padding-left: 16px;">
            ${result.positives.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    if (result.issues.length > 0) {
      detailsHTML += `
        <div style="margin-bottom: 12px;">
          <strong>⚠️ Concerns:</strong>
          <ul style="margin: 4px 0; padding-left: 16px;">
            ${result.issues.map(i => `<li>${i}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    
    detailsHTML += `
      <div style="font-size: 12px; opacity: 0.8; margin-top: 12px;">
        Analyzed: ${new Date(result.analyzedAt).toLocaleString()}
      </div>
    `;
    
    this.details.innerHTML = detailsHTML;
    this.details.style.display = 'block';
  }
  
  setLoading(loading) {
    if (loading) {
      this.checkBtn.innerHTML = '<div class="loading"><div class="spinner"></div>Analyzing...</div>';
      this.checkBtn.disabled = true;
      this.statusIcon.textContent = '🔄';
      this.statusText.textContent = 'Analyzing content...';
    } else {
      this.checkBtn.innerHTML = 'Analyze Current Page';
      this.checkBtn.disabled = false;
    }
  }
  
  showError(message) {
    this.error.textContent = message;
    this.error.style.display = 'block';
    this.statusIcon.textContent = '❌';
    this.statusText.textContent = 'Analysis failed';
  }
  
  hideError() {
    this.error.style.display = 'none';
  }
  
  openSettings() {
    // In a real implementation, this would open a settings page
    alert('Settings feature coming soon! This would allow you to configure AI providers, sensitivity levels, and trusted sources.');
  }
}

// Initialize the fact checker when the popup loads
document.addEventListener('DOMContentLoaded', () => {
  new FactChecker();
});
