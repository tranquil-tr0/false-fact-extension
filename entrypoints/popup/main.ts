import './style.css';
import type { AnalysisResult } from '../../types/index.js';
import { 
  registerKeyboardShortcuts, 
  announceToScreenReader, 
  showKeyboardShortcutsHelp,
  createSkipLink,
  enhanceForHighContrast,
  type KeyboardShortcut
} from '../../utils/accessibility.js';

// Ensure browser API is available
declare const browser: any;

// DOM Elements
const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
const loadingSpinner = document.getElementById('loading-spinner') as HTMLElement;
const progressContainer = document.getElementById('progress-container') as HTMLElement;
const progressBar = document.getElementById('progress-bar') as HTMLElement;
const progressFill = document.getElementById('progress-fill') as HTMLElement;
const progressText = document.getElementById('progress-text') as HTMLElement;
const progressTime = document.getElementById('progress-time') as HTMLElement;
const resultsSection = document.getElementById('results-section') as HTMLElement;
const resultDisplay = document.getElementById('result-display') as HTMLElement;
const errorSection = document.getElementById('error-section') as HTMLElement;
const errorTitle = document.getElementById('error-title') as HTMLElement;
const errorDescription = document.getElementById('error-description') as HTMLElement;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;
const helpBtn = document.getElementById('help-btn') as HTMLButtonElement;
const statusMessage = document.getElementById('status-message') as HTMLElement;
const pageUrl = document.getElementById('page-url') as HTMLElement;
const buttonText = analyzeBtn.querySelector('.button-text') as HTMLElement;

// State management
interface PopupState {
  currentUrl: string;
  analysisStatus: 'idle' | 'extracting' | 'analyzing' | 'complete' | 'error';
  analysisResult: AnalysisResult | null;
  errorMessage: string | null;
  errorType: string | null;
  analysisStartTime: number | null;
  canCancel: boolean;
}

let state: PopupState = {
  currentUrl: '',
  analysisStatus: 'idle',
  analysisResult: null,
  errorMessage: null,
  errorType: null,
  analysisStartTime: null,
  canCancel: false
};

// Initialize popup
async function initializePopup() {
  try {
    // Check for selected text in the active tab
    let hasSelection = false;
    let selectedText = '';
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        const selectionResult = await browser.tabs.sendMessage(tab.id, {
          action: 'get-selected-text'
        });
        selectedText = selectionResult && selectionResult.text ? selectionResult.text.trim() : '';
        hasSelection = !!selectedText;
      }
    } catch (e) {
      // Ignore errors, fallback to default
    }
    pageUrl.textContent = 'Ready to analyze';
    updateStatus('Ready to analyze content');
    analyzeBtn.disabled = false;
    buttonText.textContent = 'Analyze Content';

    // Dynamically add "Analyze Highlighted Text" button if selection exists
    const analyzeSection = document.querySelector('.analyze-section');
    let highlightedBtn = document.getElementById('analyze-highlighted-btn') as HTMLButtonElement;
    if (highlightedBtn) {
      highlightedBtn.remove();
    }
    if (hasSelection && analyzeSection) {
      highlightedBtn = document.createElement('button');
      highlightedBtn.id = 'analyze-highlighted-btn';
      highlightedBtn.className = 'analyze-button highlighted';
      highlightedBtn.type = 'button';
      highlightedBtn.setAttribute('aria-label', 'Analyze highlighted text');
      highlightedBtn.innerHTML = `<span class="button-text">Analyze Highlighted Text</span>`;
      analyzeSection.insertBefore(highlightedBtn, analyzeBtn.nextSibling);

      highlightedBtn.addEventListener('click', async () => {
        // Only analyze selected text
        updateUIState('extracting');
        try {
          const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
          if (!tab.id) {
            showError('No Active Tab', 'Please navigate to a webpage to analyze content.', 'no_tab');
            return;
          }
          state.currentUrl = tab.url || '';
          if (pageUrl) {
            pageUrl.textContent = truncateUrl(state.currentUrl);
          }
          // Show initial progress animation
          if (progressBar) {
            progressBar.classList.add('indeterminate');
          }
          // Use selectedText for extraction
          if (!selectedText) {
            showError(
              'No Highlighted Text',
              'No highlighted text was found. Please select text and try again.',
              'no_highlighted_text'
            );
            return;
          }
          // Update UI to analyzing state
          updateUIState('analyzing');
          if (progressBar) {
            progressBar.classList.remove('indeterminate');
          }
          updateProgress(60, 'Analyzing highlighted text for credibility...');
          // Send to background script for analysis
          const analysisResult = await browser.runtime.sendMessage({
            action: 'analyze-content',
            tabId: tab.id,
            data: {
              content: selectedText,
              url: state.currentUrl,
              title: document.title,
              contentType: 'selection'
            }
          });
          if (analysisResult.success) {
            updateProgress(100, 'Analysis complete');
            showSuccessFeedback('Analysis complete');
            showResults(analysisResult.data);
          } else {
            const error = analysisResult.error;
            const errorType = error?.type || 'analysis_failed';
            const errorMessage = error?.message || 'Analysis failed. Please try again.';
            const suggestedAction = error?.suggestedAction;
            handleAnalysisError(errorType, errorMessage, suggestedAction, error?.retryable);
          }
        } catch (error) {
          showError(
            'Analysis Error',
            'An unexpected error occurred during analysis. Please try again.',
            'unexpected_error'
          );
        }
      });
    }
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    showError('Initialization Error', 'Failed to initialize the extension. Please try again.', 'init_error');
  }
}

// Check for cached analysis results
async function checkForCachedResults(url: string) {
  try {
    const response = await browser.runtime.sendMessage({
      action: 'get-cached-result',
      url: url
    });

    if (response.success && response.data) {
      state.analysisResult = response.data;
      showResults(response.data);
      updateStatus('Showing cached results');
    }
  } catch (error) {
    console.warn('Failed to check cached results:', error);
    // Don't show error for cache failures
  }
}

// Check if URL can be analyzed
function isAnalyzableUrl(url: string): boolean {
  if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
    url.startsWith('moz-extension://') || url.startsWith('about:')) {
    return false;
  }
  return true;
}

// Update UI state with enhanced progress indicators
function updateUIState(newStatus: PopupState['analysisStatus']) {
  const previousStatus = state.analysisStatus;
  state.analysisStatus = newStatus;

  // Hide all sections first
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');

  // Update progress stages
  updateProgressStages(newStatus);

  switch (newStatus) {
    case 'idle':
      analyzeBtn.disabled = false;
      analyzeBtn.classList.remove('loading');
      buttonText.textContent = 'Analyze Content';
      loadingSpinner.classList.add('hidden');
      progressContainer.classList.add('hidden');
      cancelBtn.classList.add('hidden');
      state.canCancel = false;
      state.analysisStartTime = null;
      stopProgressTimer();
      updateStatus('Ready to analyze content');
      break;

    case 'extracting':
      analyzeBtn.disabled = true;
      analyzeBtn.classList.add('loading');
      buttonText.textContent = 'Extracting...';
      loadingSpinner.classList.remove('hidden');
      progressContainer.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
      state.canCancel = true;
      state.analysisStartTime = Date.now();
      
      // Show indeterminate progress initially
      if (progressBar) {
        progressBar.classList.add('indeterminate');
      }
      
      updateProgress(20, 'Extracting content from page...');
      startProgressTimer();
      updateStatus('Extracting content from page...');
      
      // Add pulsing effect to progress text
      if (progressText) {
        progressText.classList.add('pulsing');
      }
      break;

    case 'analyzing':
      analyzeBtn.disabled = true;
      analyzeBtn.classList.add('loading');
      buttonText.textContent = 'Analyzing...';
      loadingSpinner.classList.remove('hidden');
      progressContainer.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
      state.canCancel = true;
      
      // Switch from indeterminate to determinate progress
      if (progressBar) {
        progressBar.classList.remove('indeterminate');
      }
      
      // Animate progress transition
      updateProgress(60, 'Analyzing content for credibility...');
      updateStatus('Analyzing content for credibility...');
      
      // Show success transition from previous state if applicable
      if (previousStatus === 'extracting') {
        showTransitionFeedback('Content extracted successfully');
      }
      break;

    case 'complete':
      analyzeBtn.disabled = false;
      analyzeBtn.classList.remove('loading');
      buttonText.textContent = 'Analyze Again';
      loadingSpinner.classList.add('hidden');
      progressContainer.classList.add('hidden');
      cancelBtn.classList.add('hidden');
      resultsSection.classList.remove('hidden');
      state.canCancel = false;
      stopProgressTimer();
      updateProgress(100, 'Analysis complete');
      
      // Show success feedback with animation
      showSuccessFeedback('Analysis complete');
      
      // Add entrance animation to results
      if (resultsSection) {
        resultsSection.style.animation = 'fadeIn 0.5s ease-out';
      }
      break;

    case 'error':
      analyzeBtn.disabled = false;
      analyzeBtn.classList.remove('loading');
      buttonText.textContent = 'Try Again';
      loadingSpinner.classList.add('hidden');
      progressContainer.classList.add('hidden');
      cancelBtn.classList.add('hidden');
      errorSection.classList.remove('hidden');
      state.canCancel = false;
      stopProgressTimer();
      updateStatus('Analysis failed');
      
      // Add entrance animation to error section
      if (errorSection) {
        errorSection.style.animation = 'fadeIn 0.4s ease-out';
      }
      break;
  }
}

// Update status message
function updateStatus(message: string) {
  statusMessage.textContent = message;
}

// Show error state
function showError(title: string, description: string, type: string) {
  state.errorMessage = description;
  state.errorType = type;
  errorTitle.textContent = title;
  errorDescription.textContent = description;
  updateUIState('error');
}

// Show results with visualization and enhanced feedback
function showResults(analysisResult: AnalysisResult) {
  state.analysisResult = analysisResult;

  // Create results display HTML
  const resultsHTML = createResultsHTML(analysisResult);
  resultDisplay.innerHTML = resultsHTML;

  // Update UI state to complete
  updateUIState('complete');
  
  // Add highlight animation to results with a slight delay for better visual feedback
  setTimeout(() => {
    // Find and animate the credibility score
    const scoreElement = resultDisplay.querySelector('.credibility-score');
    if (scoreElement) {
      scoreElement.classList.add('highlight-animation');
    }
    
    // Animate category bars sequentially
    const categoryBars = resultDisplay.querySelectorAll('.category-fill');
    categoryBars.forEach((element, index) => {
      const bar = element as HTMLElement;
      setTimeout(() => {
        // Force a reflow to restart the animation
        bar.style.width = '0%';
        
        // Set the actual width after a tiny delay
        setTimeout(() => {
          const percentage = bar.parentElement?.nextElementSibling?.textContent || '0%';
          bar.style.width = percentage;
        }, 50);
      }, index * 200); // Stagger the animations
    });
  }, 300);
  
  // Add event listeners to expandable sections if they exist
  setupResultInteractions();
}

// Create HTML for analysis results display
function createResultsHTML(result: AnalysisResult): string {
  const credibilityLevel = getCredibilityLevel(result.credibilityScore);
  const credibilityColor = getCredibilityColor(credibilityLevel);

  return `
    <div class="analysis-results">
      <div class="credibility-header">
        <div class="credibility-score" style="color: ${credibilityColor}">
          <span class="score-value">${result.credibilityScore}%</span>
          <span class="score-label">${credibilityLevel}</span>
        </div>
        <div class="confidence-score">
          <span class="confidence-label">Confidence:</span>
          <span class="confidence-value">${result.confidence}%</span>
        </div>
      </div>
      
      <div class="category-breakdown">
        <div class="category-item">
          <div class="category-label">Factuality</div>
          <div class="category-bar">
            <div class="category-fill fact" style="width: ${result.categories.factuality}%"></div>
          </div>
          <div class="category-percentage">${result.categories.factuality}%</div>
        </div>
        
        <div class="category-item">
          <div class="category-label">Objectivity</div>
          <div class="category-bar">
            <div class="category-fill opinion" style="width: ${result.categories.objectivity}%"></div>
          </div>
          <div class="category-percentage">${result.categories.objectivity}%</div>
        </div>
        
      </div>
      
      <div class="reasoning-section">
        <div class="reasoning-header">Analysis Reasoning</div>
        <div class="reasoning-content">${formatReasoning(result.reasoning)}</div>
      </div>
      
      <div class="result-actions">
        <button class="action-button secondary" id="analyze-again-btn">
          Analyze Again
        </button>
        <button class="action-button secondary" id="share-results-btn">
          Share Results
        </button>
      </div>
    </div>
  `;
}

// Get credibility level based on score
function getCredibilityLevel(score: number): string {
  if (score >= 80) return 'High Credibility';
  if (score >= 60) return 'Moderate Credibility';
  if (score >= 40) return 'Low Credibility';
  return 'Very Low Credibility';
}

// Get color for credibility level
function getCredibilityColor(level: string): string {
  switch (level) {
    case 'High Credibility': return 'var(--success-color)';
    case 'Moderate Credibility': return 'var(--warning-color)';
    case 'Low Credibility': return 'var(--error-color)';
    case 'Very Low Credibility': return 'var(--error-color)';
    default: return 'var(--text-secondary)';
  }
}

// Format reasoning object for display
function formatReasoning(reasoning: {
  factual: string[];
  unfactual: string[];
  subjective: string[];
  objective: string[];
}): string {
  type ReasoningKey = keyof typeof reasoning;
  const sections: { label: string; key: ReasoningKey }[] = [
    { label: 'Factual', key: 'factual' },
    { label: 'Unfactual', key: 'unfactual' },
    { label: 'Subjective', key: 'subjective' },
    { label: 'Objective', key: 'objective' }
  ];
  return sections
    .map(
      ({ label, key }) =>
        Array.isArray(reasoning[key]) && reasoning[key].length
          ? `<div class="reasoning-subsection">
              <div class="reasoning-subheader">${label} Reasons</div>
              <ul>${(reasoning[key] as string[])
                .map((reason: string) => `<li>${reason}</li>`)
                .join('')}</ul>
            </div>`
          : ''
    )
    .join('');
}

// Handle analyze button click with enhanced error recovery and progress feedback
async function handleAnalyzeClick() {
  if (state.analysisStatus !== 'idle' && state.analysisStatus !== 'error' && state.analysisStatus !== 'complete') {
    return; // Already processing
  }

  try {
    // Reset any previous analysis state
    if (state.analysisStatus === 'error' || state.analysisStatus === 'complete') {
      // Brief transition to idle state for visual feedback
      updateUIState('idle');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    updateUIState('extracting');

    // Get current active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      showError('No Active Tab', 'Please navigate to a webpage to analyze content.', 'no_tab');
      return;
    }

    // Store current URL for reference
    state.currentUrl = tab.url || '';
    if (pageUrl) {
      pageUrl.textContent = truncateUrl(state.currentUrl);
    }

    // Show initial progress animation
    if (progressBar) {
      progressBar.classList.add('indeterminate');
    }
    
    // Extract content from page using content script with timeout handling
    let extractionResult;
    try {
      // Create a promise that rejects after a timeout
      const extractionTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Content extraction timed out')), 15000);
      });
      
      // Race the extraction against the timeout
      extractionResult = await Promise.race([
        browser.tabs.sendMessage(tab.id, {
          action: 'extract-content-for-analysis'
        }),
        extractionTimeout
      ]);
      
      // Update progress after successful extraction
      updateProgress(40, 'Content extracted successfully');
      
      // Show brief success message
      showTransitionFeedback('Content extracted successfully');
      
    } catch (error) {
      console.error('Content extraction failed:', error);
      
      // Check if it's a timeout error
      const err = error as Error;
      if (err.message === 'Content extraction timed out') {
        showError(
          'Extraction Timeout',
          'Content extraction took too long. The page may be too large or complex.',
          'extraction_timeout'
        );
      } else {
        showError(
          'Content Extraction Failed',
          'Unable to extract content from this page. The page may not support content extraction or may be loading.',
          'extraction_failed'
        );
      }
      return;
    }

    if (!extractionResult || !extractionResult.content) {
      showError(
        'No Content Found',
        'No analyzable content was found on this page. Try selecting text manually or visit a different page.',
        'no_content'
      );
      return;
    }

    // Update UI to analyzing state with smooth transition
    updateUIState('analyzing');
    
    // Switch from indeterminate to determinate progress
    if (progressBar) {
      progressBar.classList.remove('indeterminate');
    }
    
    // Update progress to show we're starting analysis
    updateProgress(60, 'Analyzing content for credibility...');

    // Send to background script for analysis with tab ID and cancellation support
    try {
      const analysisResult = await browser.runtime.sendMessage({
        action: 'analyze-content',
        tabId: tab.id, // Include tab ID in the message
        data: {
          content: extractionResult.content,
          url: extractionResult.url,
          title: extractionResult.title,
          contentType: extractionResult.contentType || 'article'
        }
      });

      if (analysisResult.success) {
        // Update progress to show completion
        updateProgress(100, 'Analysis complete');
        
        // Check if this is a fallback result and inform user
        if (analysisResult.data.confidence <= 30) {
          const reasoningStr = JSON.stringify(analysisResult.data.reasoning);
          if (reasoningStr && reasoningStr.includes('Fallback analysis')) {
            updateStatus('Analysis completed with limited service - results may be less accurate');
          } else {
            // Show success animation
            showSuccessFeedback('Analysis complete');
          }
        } else {
          // Show success animation
          showSuccessFeedback('Analysis complete');
        }
        
        // Show results with highlight animation
        showResults(analysisResult.data);
      } else {
        const error = analysisResult.error;
        const errorType = error?.type || 'analysis_failed';
        const errorMessage = error?.message || 'Analysis failed. Please try again.';
        const suggestedAction = error?.suggestedAction;
        
        // Provide more specific error handling based on error type
        handleAnalysisError(errorType, errorMessage, suggestedAction, error?.retryable);
      }
    } catch (error) {
      // Check if this was a user-initiated cancellation
      if (state.analysisStatus === 'idle') {
        // User already cancelled, no need to show error
        return;
      }
      
      console.error('Analysis failed:', error);
      showError(
        'Analysis Error',
        'An unexpected error occurred during analysis. Please try again.',
        'unexpected_error'
      );
    }

  } catch (error) {
    console.error('Analysis failed:', error);
    showError(
      'Analysis Error',
      'An unexpected error occurred during analysis. Please try again.',
      'unexpected_error'
    );
  }
}

// Enhanced error handling with recovery suggestions
function handleAnalysisError(errorType: string, errorMessage: string, suggestedAction?: string, retryable?: boolean) {
  let title = 'Analysis Failed';
  let description = errorMessage;
  let actionText = suggestedAction || 'Please try again.';

  switch (errorType) {
    case 'network_error':
      title = 'Network Connection Issue';
      description = 'Unable to connect to the analysis service.';
      actionText = 'Please check your internet connection and try again.';
      break;

    case 'rate_limited':
      title = 'Too Many Requests';
      description = 'The analysis service is temporarily limiting requests.';
      actionText = 'Please wait a moment and try again.';
      // Auto-retry after delay for rate limits
      if (retryable) {
        setTimeout(() => {
          if (state.analysisStatus === 'error') {
            updateStatus('Retrying analysis...');
            setTimeout(() => handleAnalyzeClick(), 1000);
          }
        }, 5000);
      }
      break;

    case 'api_unavailable':
      title = 'Service Temporarily Unavailable';
      description = 'The analysis service is currently unavailable.';
      actionText = 'Please try again in a few minutes. Some results may use fallback analysis.';
      break;

    case 'invalid_content':
      title = 'Content Cannot Be Analyzed';
      description = errorMessage;
      actionText = suggestedAction || 'Please try selecting different text or visit another page.';
      break;

    case 'extraction_failed':
      title = 'Content Extraction Failed';
      description = 'Unable to extract text from this page.';
      actionText = 'Try refreshing the page or selecting text manually.';
      break;

    case 'content_too_long':
      title = 'Content Too Long';
      description = 'The selected content is too long for analysis.';
      actionText = 'Please select a shorter portion of text to analyze.';
      break;

    default:
      title = 'Analysis Error';
      description = errorMessage || 'An unexpected error occurred.';
      actionText = suggestedAction || 'Please try again later.';
  }

  // Show enhanced error message
  showError(title, `${description} ${actionText}`, errorType);
}

// Handle retry button click
function handleRetryClick() {
  updateUIState('idle');
}

// Handle help button click
function handleHelpClick() {
  const helpMessages: Record<string, string> = {
    'no_tab': 'Make sure you have an active tab open with a webpage.',
    'unsupported_page': 'Try navigating to a news article or social media post.',
    'extraction_failed': 'Refresh the page and try again, or try a different website.',
    'no_content': 'Make sure the page has loaded completely, or try selecting text manually.',
    'analysis_failed': 'Check your internet connection and try again.',
    'api_unavailable': 'The analysis service is temporarily unavailable. Please try again later.',
    'network_error': 'Check your internet connection and try again.',
    'rate_limited': 'Too many requests. Please wait a moment and try again.',
    'content_too_long': 'The content is too long to analyze. Try selecting a smaller portion.',
    'unexpected_error': 'Try refreshing the extension or restarting your browser.'
  };

  const helpMessage = helpMessages[state.errorType || 'unexpected_error'] || helpMessages['unexpected_error'];

  // Show help message in status
  updateStatus(`Help: ${helpMessage}`);

  // Reset status after 5 seconds
  setTimeout(() => {
    if (state.analysisStatus === 'error') {
      updateStatus('Analysis failed');
    }
  }, 5000);
}

// Handle analyze again action from results
function handleAnalyzeAgain() {
  updateUIState('idle');
}

// Handle share results action
function handleShareResults() {
  if (!state.analysisResult) return;

  const shareText = `Fact-check results for ${state.currentUrl}:\n` +
    `Credibility: ${state.analysisResult.credibilityScore}%\n` +
    `Factuality: ${state.analysisResult.categories.factuality}% | ` +
    `Objectivity: ${state.analysisResult.categories.objectivity}%`;

  // Copy to clipboard
  navigator.clipboard.writeText(shareText).then(() => {
    updateStatus('Results copied to clipboard');
    setTimeout(() => {
      if (state.analysisStatus === 'complete') {
        updateStatus('Analysis complete');
      }
    }, 2000);
  }).catch(() => {
    updateStatus('Failed to copy results');
  });
}

// Progress tracking variables
let progressTimer: number | null = null;
let timeoutTimer: number | null = null;
const SHORT_TIMEOUT = 30000; // 30 seconds
const LONG_TIMEOUT = 60000; // 60 seconds

// Update progress indicator with enhanced visual feedback
function updateProgress(percentage: number, message: string) {
  if (progressFill) {
    // Use smooth animation for progress updates
    progressFill.style.width = `${percentage}%`;
  }
  
  if (progressText) {
    // Animate text change
    progressText.style.opacity = '0';
    
    setTimeout(() => {
      progressText.textContent = message;
      progressText.style.opacity = '1';
    }, 200);
  }
}

// Start progress timer with warning indicators
function startProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
  }
  
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
  }
  
  // Set up timeout warning and auto-cancellation
  setupTimeoutHandling();
  
  progressTimer = window.setInterval(() => {
    if (state.analysisStartTime && progressTime) {
      const elapsed = Math.floor((Date.now() - state.analysisStartTime) / 1000);
      progressTime.textContent = `${elapsed}s`;
      
      // Add warning class when approaching timeout
      if (elapsed >= 20) {
        progressTime.classList.add('warning');
      } else {
        progressTime.classList.remove('warning');
      }
    }
  }, 1000);
}

// Stop progress timer and clear timeout
function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
  
  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
  
  // Reset progress time display
  if (progressTime) {
    progressTime.classList.remove('warning');
  }
}

// Set up timeout handling with user notifications
function setupTimeoutHandling() {
  // First timeout: Warning notification
  setTimeout(() => {
    if (state.analysisStatus === 'extracting' || state.analysisStatus === 'analyzing') {
      // Show warning notification
      showTimeoutWarning();
    }
  }, SHORT_TIMEOUT - 5000); // 5 seconds before short timeout
  
  // Short timeout: Consider showing partial results
  setTimeout(() => {
    if (state.analysisStatus === 'analyzing') {
      // If in analyzing phase for too long, show notification
      updateStatus('Analysis is taking longer than expected...');
    }
  }, SHORT_TIMEOUT);
  
  // Final timeout: Auto-cancel
  timeoutTimer = window.setTimeout(() => {
    if (state.analysisStatus === 'extracting' || state.analysisStatus === 'analyzing') {
      handleCancelClick();
      showError(
        'Analysis Timeout', 
        'The analysis took too long and was automatically cancelled. Try with shorter content or try again later.', 
        'timeout'
      );
    }
  }, LONG_TIMEOUT);
}

// Show timeout warning with option to continue or cancel
function showTimeoutWarning() {
  // Create warning element
  const warningElement = document.createElement('div');
  warningElement.className = 'timeout-warning';
  warningElement.innerHTML = `
    <div class="warning-message">
      <span>Analysis is taking longer than expected</span>
      <button class="continue-button">Continue</button>
    </div>
  `;
  
  // Add to progress container
  if (progressContainer) {
    progressContainer.appendChild(warningElement);
    
    // Add show class after a small delay for animation
    setTimeout(() => {
      warningElement.classList.add('show');
    }, 10);
    
    // Add event listener to continue button
    const continueButton = warningElement.querySelector('.continue-button');
    if (continueButton) {
      continueButton.addEventListener('click', () => {
        // Remove warning and extend timeout
        warningElement.classList.remove('show');
        setTimeout(() => {
          if (progressContainer.contains(warningElement)) {
            progressContainer.removeChild(warningElement);
          }
        }, 300);
        
        // Reset timeout timer to give more time
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = window.setTimeout(() => {
            if (state.analysisStatus === 'extracting' || state.analysisStatus === 'analyzing') {
              handleCancelClick();
              showError(
                'Analysis Timeout', 
                'The analysis took too long and was automatically cancelled.', 
                'timeout'
              );
            }
          }, LONG_TIMEOUT);
        }
      });
    }
    
    // Auto-remove after 10 seconds if not clicked
    setTimeout(() => {
      if (progressContainer.contains(warningElement)) {
        warningElement.classList.remove('show');
        setTimeout(() => {
          if (progressContainer.contains(warningElement)) {
            progressContainer.removeChild(warningElement);
          }
        }, 300);
      }
    }, 10000);
  }
}

// Handle cancel button click with enhanced user feedback
async function handleCancelClick() {
  if (!state.canCancel) {
    return;
  }

  // Show cancellation in progress feedback
  cancelBtn.disabled = true;
  cancelBtn.textContent = 'Cancelling...';
  
  try {
    // Send cancellation message to background script
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      await browser.runtime.sendMessage({
        action: 'cancel-analysis',
        tabId: tab.id
      });
    }
  } catch (error) {
    console.warn('Failed to cancel analysis:', error);
  }

  // Reset UI state with cancellation feedback
  updateUIState('idle');
  updateStatus('Analysis cancelled by user');
  
  // Show brief cancellation message
  const feedbackElement = document.createElement('div');
  feedbackElement.className = 'cancellation-feedback';
  feedbackElement.textContent = 'Analysis cancelled';
  
  // Add to analyze section
  const analyzeSection = document.querySelector('.analyze-section');
  if (analyzeSection) {
    analyzeSection.appendChild(feedbackElement);
    
    // Animate and remove
    setTimeout(() => {
      feedbackElement.classList.add('show');
      
      setTimeout(() => {
        feedbackElement.classList.remove('show');
        setTimeout(() => {
          if (analyzeSection.contains(feedbackElement)) {
            analyzeSection.removeChild(feedbackElement);
          }
        }, 300);
      }, 2000);
    }, 10);
  }
  
  // Reset cancel button state
  cancelBtn.disabled = false;
  cancelBtn.textContent = 'Cancel';
}

// Enhanced timeout handling with user feedback
function setupAnalysisTimeout(timeoutMs: number = 30000) {
  return setTimeout(() => {
    if (state.analysisStatus === 'extracting' || state.analysisStatus === 'analyzing') {
      handleCancelClick();
      showError(
        'Analysis Timeout',
        'The analysis took too long and was automatically cancelled.',
        'timeout'
      );
    }
  }, timeoutMs);
}

// Initialize event listeners and accessibility features
analyzeBtn.addEventListener('click', handleAnalyzeClick);
cancelBtn.addEventListener('click', handleCancelClick);
retryBtn.addEventListener('click', handleRetryClick);
helpBtn.addEventListener('click', handleHelpClick);

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', initializePopup);

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
  stopProgressTimer();
});

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'a',
      description: 'Analyze content',
      action: () => {
        if (analyzeBtn && !analyzeBtn.disabled) {
          handleAnalyzeClick();
        }
      }
    },
    {
      key: 'c',
      description: 'Cancel analysis',
      action: () => {
        if (state.canCancel && cancelBtn && !cancelBtn.classList.contains('hidden')) {
          handleCancelClick();
        }
      }
    },
    {
      key: 'r',
      description: 'Retry analysis',
      action: () => {
        if (state.analysisStatus === 'error') {
          handleRetryClick();
          handleAnalyzeClick();
        }
      }
    },
    {
      key: 's',
      description: 'Share results',
      action: () => {
        if (state.analysisStatus === 'complete' && state.analysisResult) {
          handleShareResults();
        }
      }
    },
    {
      key: 'h',
      description: 'Show help',
      action: () => {
        showKeyboardShortcutsHelp(shortcuts);
      },
      modifier: 'alt'
    },
    {
      key: 'Escape',
      description: 'Cancel analysis or close dialogs',
      action: () => {
        if (state.canCancel) {
          handleCancelClick();
        }
        // Close any open dialogs
        const dialog = document.querySelector('.keyboard-shortcuts-help');
        if (dialog) {
          dialog.remove();
        }
      }
    }
  ];

  registerKeyboardShortcuts(shortcuts);
}

// Update progress stages indicator with ARIA attributes
function updateProgressStages(currentStatus: PopupState['analysisStatus']) {
  // Get all stage elements
  const stageExtract = document.getElementById('stage-extract');
  const stageAnalyze = document.getElementById('stage-analyze');
  const stageComplete = document.getElementById('stage-complete');
  
  // Reset all stages
  [stageExtract, stageAnalyze, stageComplete].forEach(stage => {
    if (stage) {
      stage.classList.remove('active', 'completed');
    }
  });
  
  // Update stages based on current status
  switch (currentStatus) {
    case 'extracting':
      if (stageExtract) {
        stageExtract.classList.add('active');
        stageExtract.setAttribute('aria-current', 'step');
      }
      break;
      
    case 'analyzing':
      if (stageExtract) {
        stageExtract.classList.add('completed');
        stageExtract.removeAttribute('aria-current');
      }
      if (stageAnalyze) {
        stageAnalyze.classList.add('active');
        stageAnalyze.setAttribute('aria-current', 'step');
      }
      break;
      
    case 'complete':
      if (stageExtract && stageAnalyze) {
        stageExtract.classList.add('completed');
        stageAnalyze.classList.add('completed');
        stageExtract.removeAttribute('aria-current');
        stageAnalyze.removeAttribute('aria-current');
      }
      if (stageComplete) {
        stageComplete.classList.add('active', 'completed');
        stageComplete.setAttribute('aria-current', 'step');
      }
      break;
  }
  
  // Update ARIA attributes for progress container
  if (progressContainer) {
    // Update aria-valuenow based on status
    let progressValue = 0;
    switch (currentStatus) {
      case 'extracting': progressValue = 20; break;
      case 'analyzing': progressValue = 60; break;
      case 'complete': progressValue = 100; break;
    }
    progressContainer.setAttribute('aria-valuenow', progressValue.toString());
  }
}

// Show transition feedback with screen reader announcement
function showTransitionFeedback(message: string) {
  const feedbackElement = document.createElement('div');
  feedbackElement.className = 'transition-feedback';
  feedbackElement.textContent = message;
  
  // Add to analyze section
  const analyzeSection = document.querySelector('.analyze-section');
  if (analyzeSection) {
    analyzeSection.appendChild(feedbackElement);
    
    // Animate and remove
    setTimeout(() => {
      feedbackElement.classList.add('show');
      
      // Announce to screen readers
      announceToScreenReader(message);
      
      setTimeout(() => {
        feedbackElement.classList.remove('show');
        setTimeout(() => {
          if (analyzeSection.contains(feedbackElement)) {
            analyzeSection.removeChild(feedbackElement);
          }
        }, 300);
      }, 2000);
    }, 10);
  }
}

// Show success feedback with screen reader announcement
function showSuccessFeedback(message: string) {
  statusMessage.textContent = message;
  statusMessage.classList.add('success-feedback');
  
  // Announce to screen readers
  announceToScreenReader(message, 'polite');
  
  setTimeout(() => {
    statusMessage.classList.remove('success-feedback');
  }, 2000);
}

// Truncate URL for display
function truncateUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let displayUrl = urlObj.hostname + urlObj.pathname;
    if (displayUrl.length > 40) {
      displayUrl = displayUrl.substring(0, 37) + '...';
    }
    return displayUrl;
  } catch (e) {
    return url.length > 40 ? url.substring(0, 37) + '...' : url;
  }
}

// Setup result interactions with keyboard navigation
function setupResultInteractions() {
  // Add event listeners to expandable sections
  const expandableSections = document.querySelectorAll('.reasoning-subheader.expandable');
  expandableSections.forEach(section => {
    section.addEventListener('click', () => {
      const isExpanded = section.classList.contains('expanded');
      section.classList.toggle('expanded');
      section.setAttribute('aria-expanded', (!isExpanded).toString());
      
      const content = section.nextElementSibling as HTMLElement;
      if (content && content.classList.contains('reasoning-content')) {
        content.classList.toggle('collapsed');
      }
    });
    
    // Add keyboard support
    section.setAttribute('tabindex', '0');
    section.setAttribute('role', 'button');
    section.setAttribute('aria-expanded', 'false');
    
    section.addEventListener('keydown', (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter' || ke.key === ' ') {
        ke.preventDefault();
        (section as HTMLElement).click();
      }
    });
  });
  
  // Add event listeners to action buttons
  const analyzeAgainBtn = document.getElementById('analyze-again-btn');
  const shareResultsBtn = document.getElementById('share-results-btn');
  
  if (analyzeAgainBtn) {
    analyzeAgainBtn.addEventListener('click', () => {
      analyzeAgainBtn.classList.add('clicked');
      setTimeout(() => {
        analyzeAgainBtn.classList.remove('clicked');
        handleAnalyzeAgain();
        handleAnalyzeClick();
      }, 200);
    });
    
    // Add keyboard accessibility
    analyzeAgainBtn.setAttribute('aria-label', 'Analyze content again');
  }
  
  if (shareResultsBtn) {
    shareResultsBtn.addEventListener('click', () => {
      shareResultsBtn.classList.add('clicked');
      setTimeout(() => {
        shareResultsBtn.classList.remove('clicked');
        handleShareResults();
      }, 200);
    });
    
    // Add keyboard accessibility
    shareResultsBtn.setAttribute('aria-label', 'Share analysis results');
  }
}

// Add skip link for keyboard navigation
function addSkipLink() {
  const skipLink = createSkipLink('result-display', 'Skip to analysis results');
  document.body.insertBefore(skipLink, document.body.firstChild);
}

// Initialize accessibility features
function initializeAccessibility() {
  // Add skip link for keyboard navigation
  addSkipLink();
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Check for high contrast mode
  enhanceForHighContrast();
  
  // Add screen reader announcer
  const announcer = document.createElement('div');
  announcer.id = 'screen-reader-announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(announcer);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  // Initialize popup
  initializePopup();
  
  // Initialize accessibility features
  initializeAccessibility();
  
  // Add event listeners
  analyzeBtn.addEventListener('click', handleAnalyzeClick);
  cancelBtn.addEventListener('click', handleCancelClick);
  retryBtn.addEventListener('click', () => {
    handleRetryClick();
    handleAnalyzeClick();
  });
  helpBtn.addEventListener('click', handleHelpClick);

});


window.requestAnimationFrame(() => {
  // Defer any heavy logic here if needed for faster first paint
});