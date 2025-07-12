// Background service worker for the fact-checking extension
class FactCheckBackground {
  constructor() {
    this.init();
  }
  
  init() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });
    
    // Handle tab updates to clear cache when page changes
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabUpdate(tab);
      }
    });
    
    // Handle messages from content scripts or popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the messaging channel open for async responses
    });
  }
  
  handleInstallation(details) {
    if (details.reason === 'install') {
      // Set default settings
      chrome.storage.sync.set({
        settings: {
          autoCheck: false,
          showPageOverlay: true,
          sensitivityLevel: 'medium',
          trustedSources: [
            'reuters.com',
            'ap.org',
            'bbc.com',
            'npr.org'
          ]
        }
      });
      
      console.log('Is This Real? extension installed');
    }
  }
  
  async handleTabUpdate(tab) {
    try {
      // Check if auto-check is enabled
      const result = await chrome.storage.sync.get(['settings']);
      const settings = result.settings || {};
      
      if (settings.autoCheck && tab.url.startsWith('http')) {
        // Automatically analyze the page
        this.analyzePageInBackground(tab);
      }
      
      // Update the action badge based on cached results
      this.updateActionBadge(tab);
      
    } catch (error) {
      console.error('Error handling tab update:', error);
    }
  }
  
  async analyzePageInBackground(tab) {
    try {
      // Extract content from the page
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: this.extractPageContent
      });
      
      const pageContent = results[0].result;
      
      if (pageContent.title || pageContent.content) {
        // Store that analysis is in progress
        await chrome.storage.local.set({
          [`analyzing_${tab.url}`]: true
        });
        
        // Simulate analysis (in real implementation, call AI service)
        const analysis = await this.performAnalysis(pageContent);
        
        // Cache the result
        await chrome.storage.local.set({
          [`result_${tab.url}`]: analysis,
          [`analyzing_${tab.url}`]: false
        });
        
        // Update badge
        this.updateActionBadge(tab);
        
        // Inject overlay if enabled
        const result = await chrome.storage.sync.get(['settings']);
        const settings = result.settings || {};
        
        if (settings.showPageOverlay) {
          this.injectFactCheckOverlay(tab.id, analysis);
        }
      }
      
    } catch (error) {
      console.error('Error analyzing page in background:', error);
      await chrome.storage.local.set({
        [`analyzing_${tab.url}`]: false
      });
    }
  }
  
  async updateActionBadge(tab) {
    try {
      const result = await chrome.storage.local.get([`result_${tab.url}`, `analyzing_${tab.url}`]);
      
      if (result[`analyzing_${tab.url}`]) {
        chrome.action.setBadgeText({ text: '...', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#FFA500', tabId: tab.id });
      } else if (result[`result_${tab.url}`]) {
        const analysis = result[`result_${tab.url}`];
        let badgeText = '';
        let badgeColor = '';
        
        if (analysis.score >= 70) {
          badgeText = '✓';
          badgeColor = '#10B981';
        } else if (analysis.score >= 40) {
          badgeText = '?';
          badgeColor = '#F59E0B';
        } else {
          badgeText = '!';
          badgeColor = '#EF4444';
        }
        
        chrome.action.setBadgeText({ text: badgeText, tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId: tab.id });
      } else {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }
  
  async injectFactCheckOverlay(tabId, analysis) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        function: this.createFactCheckOverlay,
        args: [analysis]
      });
    } catch (error) {
      console.error('Error injecting overlay:', error);
    }
  }
  
  createFactCheckOverlay(analysis) {
    // Remove existing overlay if present
    const existingOverlay = document.getElementById('fact-check-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // Create new overlay
    const overlay = document.createElement('div');
    overlay.id = 'fact-check-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 280px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      z-index: 10000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.4;
      border: 1px solid rgba(255, 255, 255, 0.2);
    `;
    
    overlay.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">${analysis.icon}</span>
          <strong>Fact Check</strong>
        </div>
        <button id="close-fact-check" style="background: none; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7;">×</button>
      </div>
      <div style="margin-bottom: 8px;">
        <strong>${analysis.assessment}</strong>
      </div>
      <div style="font-size: 12px; opacity: 0.9;">
        Credibility Score: ${analysis.score}/100
      </div>
    `;
    
    // Add close functionality
    overlay.querySelector('#close-fact-check').addEventListener('click', () => {
      overlay.remove();
    });
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
      if (overlay.parentNode) {
        overlay.style.transition = 'opacity 0.5s';
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 500);
      }
    }, 10000);
    
    document.body.appendChild(overlay);
  }
  
  extractPageContent() {
    const title = document.title || '';
    
    let content = '';
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
        if (content.length > 100) break;
      }
    }
    
    if (!content || content.length < 100) {
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map(p => p.innerText.trim())
        .filter(text => text.length > 50)
        .slice(0, 10);
      
      content = paragraphs.join(' ');
    }
    
    return {
      title,
      content: content.substring(0, 5000),
      url: window.location.href
    };
  }
  
  async performAnalysis(pageContent) {
    // Simulate analysis with mock data
    return new Promise((resolve) => {
      setTimeout(() => {
        const analysis = this.mockAnalysis(pageContent);
        resolve(analysis);
      }, 1500);
    });
  }
  
  mockAnalysis(pageContent) {
    const { title, content, url } = pageContent || {};
    if (!title || !content) {
      return {
        assessment: 'Analysis Failed',
        icon: '❌',
        score: 0,
        issues: ['No article content found for analysis.'],
        positives: [],
        analyzedAt: new Date().toISOString()
      };
    }
    let credibilityScore = 0.5;
    let issues = [];
    let positives = [];
    let domain = '';
    const trustedDomains = ['reuters.com', 'ap.org', 'bbc.com', 'npr.org', 'cnn.com'];
    try {
      if (url) {
        domain = new URL(url).hostname;
        if (trustedDomains.some(d => domain.includes(d))) {
          credibilityScore += 0.3;
          positives.push('Published by a trusted news source');
        }
      }
    } catch (e) {
      // If URL parsing fails, skip domain checks
    }
    const emotionalWords = ['SHOCKING', 'BREAKING', 'EXCLUSIVE', 'URGENT'];
    const emotionalCount = emotionalWords.filter(word => 
      title.toUpperCase().includes(word) || content.toUpperCase().includes(word)
    ).length;
    if (emotionalCount > 2) {
      credibilityScore -= 0.2;
      issues.push('Contains sensational language');
    }
    if (content.length < 200) {
      credibilityScore -= 0.1;
      issues.push('Limited content');
    }
    const hasSources = content.includes('according to') || content.includes('study shows');
    if (hasSources) {
      credibilityScore += 0.2;
      positives.push('References sources');
    }
    let assessment, icon;
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
  
  handleMessage(request, sender, sendResponse) {
    switch (request.type) {
      case 'GET_ANALYSIS':
        this.getAnalysis(request.url).then(sendResponse);
        break;
      case 'CLEAR_CACHE':
        this.clearCache().then(sendResponse);
        break;
      case 'QUICK_ANALYZE':
        // Perform analysis on the provided content and return the result
        this.performAnalysis(request.content)
          .then(analysis => sendResponse({ analysis }))
          .catch(error => sendResponse({ error: error.message }));
        break;
      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }
  
  async getAnalysis(url) {
    try {
      const result = await chrome.storage.local.get(`result_${url}`);
      return result[`result_${url}`] || null;
    } catch (error) {
      return { error: error.message };
    }
  }
  
  async clearCache() {
    try {
      await chrome.storage.local.clear();
      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }
}

// Initialize the background script
new FactCheckBackground();
