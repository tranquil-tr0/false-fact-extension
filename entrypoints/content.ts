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

      // Respond with selected text for analyze-highlighted button
      if (message.action === 'get-selected-text') {
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString().trim() : '';
        sendResponse({ text: selectedText });
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
