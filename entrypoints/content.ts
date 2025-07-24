import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { ContentExtractionResult } from '../types/models.js';
import {
  sanitizeText,
  sanitizeTitle,
  countWords,
  validateContent,
  isSocialMediaContent,
  validateUrl
} from '../utils/index.js';

export default defineContentScript({
  matches: ['*://*/*'], // Run on all pages
  main() {
    // Initialize text selection functionality
    initializeTextSelection();
    
    // Listen for messages from the popup
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'extract-article-text') {
        extractArticleText()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // Keep message channel open for async response
      }
      
      if (message.action === 'extract-selected-text') {
        extractSelectedText()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // Keep message channel open for async response
      }
      
      if (message.action === 'extract-content-for-analysis') {
        extractContentForAnalysis()
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // Keep message channel open for async response
      }
      
      if (message.action === 'get-selection-status') {
        const selection = window.getSelection();
        const hasSelection = selection ? selection.toString().trim().length > 0 : false;
        sendResponse({ hasSelection });
        return true;
      }
      
      return false;
    });
  },
});

/**
 * Extracts article text using Readability.js with enhanced metadata
 */
async function extractArticleText(): Promise<ContentExtractionResult> {
  const currentUrl = window.location.href;
  
  if (!validateUrl(currentUrl)) {
    throw new Error('Invalid URL for content extraction');
  }

  // Clone document for Readability processing
  const documentClone = document.cloneNode(true) as Document;
  const article = new Readability(documentClone).parse();
  
  if (!article) {
    throw new Error('Failed to extract article content using Readability');
  }

  const turndownService = new TurndownService();
  // Extract HTML content and convert to markdown
  const title = sanitizeTitle(article.title || document.title || '');
  const htmlContent = article.content || '';
  const content = htmlContent
    ? turndownService.turndown(htmlContent)
    : '';
  
  if (!title.trim()) {
    throw new Error('No title found for content extraction');
  }
  
  if (!content.trim()) {
    throw new Error('No content found for extraction');
  }

  // Calculate word count
  const wordCount = countWords(content);
  
  // Create extraction result
  const extractionResult: ContentExtractionResult = {
    title,
    content,
    url: currentUrl,
    extractionMethod: 'readability',
    timestamp: Date.now()
  };

  // Create extended content for validation
  const extendedContent = {
    ...extractionResult,
    contentType: "article" as const,
    wordCount
  };

  // Validate content meets requirements
  try {
    validateContent(extendedContent);
  } catch (error) {
    throw new Error(`Content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return extractionResult;
}

/**
 * Initializes text selection functionality for social media platforms
 */
function initializeTextSelection(): void {
  let selectionTimeout: NodeJS.Timeout | null = null;
  let lastSelection = '';
  
  // Add selection change listener
  document.addEventListener('selectionchange', () => {
    // Debounce selection changes to avoid excessive processing
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
    }
    
    selectionTimeout = setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || '';
      
      // Only process if selection has changed and is substantial
      if (selectedText !== lastSelection && selectedText.length > 0) {
        lastSelection = selectedText;
        showSelectionFeedback(selection);
      } else if (selectedText.length === 0) {
        hideSelectionFeedback();
        lastSelection = '';
      }
    }, 300);
  });
  
  // Add mouse up listener for additional selection detection
  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection?.toString().trim() || '';
      
      if (selectedText.length > 0) {
        showSelectionFeedback(selection);
      }
    }, 100);
  });
}

/**
 * Shows visual feedback for text selection on social media platforms
 */
function showSelectionFeedback(selection: Selection | null): void {
  if (!selection || selection.rangeCount === 0) return;
  
  // Remove existing feedback
  hideSelectionFeedback();
  
  try {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    // Create feedback tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'fact-check-selection-tooltip';
    tooltip.innerHTML = `
      <div style="
        position: fixed;
        top: ${rect.top - 40}px;
        left: ${rect.left + (rect.width / 2) - 75}px;
        background: #1a73e8;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        pointer-events: none;
        animation: fadeIn 0.2s ease-in;
      ">
        Text selected for fact-checking
        <div style="
          position: absolute;
          top: 100%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid #1a73e8;
        "></div>
      </div>
    `;
    
    // Add CSS animation
    if (!document.getElementById('fact-check-selection-styles')) {
      const styles = document.createElement('style');
      styles.id = 'fact-check-selection-styles';
      styles.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(styles);
    }
    
    document.body.appendChild(tooltip);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      hideSelectionFeedback();
    }, 3000);
    
  } catch (error) {
    console.warn('Failed to show selection feedback:', error);
  }
}

/**
 * Hides visual feedback for text selection
 */
function hideSelectionFeedback(): void {
  const tooltip = document.getElementById('fact-check-selection-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

/**
 * Extracts selected text without fallback mechanisms
 */
async function extractSelectedText(): Promise<ContentExtractionResult> {
  const currentUrl = window.location.href;
  
  if (!validateUrl(currentUrl)) {
    throw new Error('Invalid URL for content extraction');
  }

  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || '';
  
  if (!selectedText) {
    throw new Error('No text selected. Please select text on the page to analyze.');
  }

  // Sanitize selected content
  const content = sanitizeText(selectedText);
  
  if (!content.trim()) {
    throw new Error('Selected text is empty after sanitization');
  }

  // Title is always blank
  const title = '';

  // Calculate word count
  const wordCount = countWords(content);
  
  // Create extraction result
  const extractionResult: ContentExtractionResult = {
    title,
    content,
    url: currentUrl,
    extractionMethod: 'selection',
    timestamp: Date.now()
  };

  // Create extended content for validation
  const extendedContent = {
    ...extractionResult,
    contentType: "article" as const,
    wordCount
  };

  // Validate content meets requirements
  try {
    validateContent(extendedContent);
  } catch (error) {
    throw new Error(`Selected content validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return extractionResult;
}

/**
 * Extracts content for analysis - chooses between article extraction and text selection only
 */
async function extractContentForAnalysis(): Promise<ContentExtractionResult & { contentType: string }> {
  const currentUrl = window.location.href;
  
  if (!validateUrl(currentUrl)) {
    throw new Error('Invalid URL for content extraction');
  }

  // Check if user has selected text
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || '';
  
  // If user has selected substantial text, prioritize that
  if (selectedText && selectedText.length > 0) {
    try {
      const result = await extractSelectedText();
      return { ...result, contentType: "article" as const };
    } catch (error) {
      console.warn('Selected text extraction failed, falling back to article extraction:', error);
    }
  }
  
  // For articles, try Readability
  try {
    const result = await extractArticleText();
    return { ...result, contentType: "article" as const };
  } catch (error) {
    console.warn('Article extraction failed:', error);
  }
  
  // If all methods fail, provide helpful error message
  throw new Error('No analyzable content found on this page. Try selecting text manually or visit a news article.');
}
