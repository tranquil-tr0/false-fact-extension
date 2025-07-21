import './style.css';
import type { AnalysisResult } from '../../types/index.js';

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
    // Simply show ready state - the content script will handle URL detection
    pageUrl.textContent = 'Ready to analyze';
    updateStatus('Ready to analyze content');
    analyzeBtn.disabled = false;
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
  state.analysisStatus = newStatus;

  // Hide all sections first
  resultsSection.classList.add('hidden');
  errorSection.classList.add('hidden');

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
      updateProgress(20, 'Extracting content from page...');
      startProgressTimer();
      updateStatus('Extracting content from page...');
      break;

    case 'analyzing':
      analyzeBtn.disabled = true;
      analyzeBtn.classList.add('loading');
      buttonText.textContent = 'Analyzing...';
      loadingSpinner.classList.remove('hidden');
      progressContainer.classList.remove('hidden');
      cancelBtn.classList.remove('hidden');
      state.canCancel = true;
      updateProgress(60, 'Analyzing content for credibility...');
      updateStatus('Analyzing content for credibility...');
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
      updateStatus('Analysis complete');
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

// Show results with visualization
function showResults(analysisResult: AnalysisResult) {
  state.analysisResult = analysisResult;

  // Create results display HTML
  const resultsHTML = createResultsHTML(analysisResult);
  resultDisplay.innerHTML = resultsHTML;

  updateUIState('complete');
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
          <div class="category-label">Factual</div>
          <div class="category-bar">
            <div class="category-fill fact" style="width: ${result.categories.fact}%"></div>
          </div>
          <div class="category-percentage">${result.categories.fact}%</div>
        </div>
        
        <div class="category-item">
          <div class="category-label">Opinion</div>
          <div class="category-bar">
            <div class="category-fill opinion" style="width: ${result.categories.opinion}%"></div>
          </div>
          <div class="category-percentage">${result.categories.opinion}%</div>
        </div>
        
        <div class="category-item">
          <div class="category-label">False</div>
          <div class="category-bar">
            <div class="category-fill false" style="width: ${result.categories.false}%"></div>
          </div>
          <div class="category-percentage">${result.categories.false}%</div>
        </div>
      </div>
      
      <div class="reasoning-section">
        <div class="reasoning-header">Analysis Reasoning</div>
        <div class="reasoning-content">${formatReasoning(result.reasoning)}</div>
      </div>
      
      <div class="result-actions">
        <button class="action-button secondary" onclick="handleAnalyzeAgain()">
          Analyze Again
        </button>
        <button class="action-button secondary" onclick="handleShareResults()">
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

// Handle analyze button click with enhanced error recovery
async function handleAnalyzeClick() {
  if (state.analysisStatus !== 'idle' && state.analysisStatus !== 'error' && state.analysisStatus !== 'complete') {
    return; // Already processing
  }

  try {
    updateUIState('extracting');

    // Get current active tab
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      showError('No Active Tab', 'Please navigate to a webpage to analyze content.', 'no_tab');
      return;
    }

    // Extract content from page using content script
    let extractionResult;
    try {
      extractionResult = await browser.tabs.sendMessage(tab.id, {
        action: 'extract-content-for-analysis'
      });
    } catch (error) {
      console.error('Content extraction failed:', error);
      showError(
        'Content Extraction Failed',
        'Unable to extract content from this page. The page may not support content extraction or may be loading.',
        'extraction_failed'
      );
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

    updateUIState('analyzing');

    // Send to background script for analysis with tab ID
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
      // Check if this is a fallback result and inform user
      if (analysisResult.data.confidence <= 30 && analysisResult.data.reasoning.includes('Fallback analysis')) {
        updateStatus('Analysis completed with limited service - results may be less accurate');
      }
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
    `Factual: ${state.analysisResult.categories.fact}% | ` +
    `Opinion: ${state.analysisResult.categories.opinion}% | ` +
    `False: ${state.analysisResult.categories.false}%`;

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

// Update progress indicator
function updateProgress(percentage: number, message: string) {
  if (progressFill) {
    progressFill.style.width = `${percentage}%`;
  }
  if (progressText) {
    progressText.textContent = message;
  }
}

// Start progress timer
function startProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
  }
  
  progressTimer = window.setInterval(() => {
    if (state.analysisStartTime && progressTime) {
      const elapsed = Math.floor((Date.now() - state.analysisStartTime) / 1000);
      progressTime.textContent = `${elapsed}s`;
      
      // Auto-timeout after 60 seconds
      if (elapsed >= 60) {
        handleCancelClick();
        showError(
          'Analysis Timeout', 
          'The analysis is taking too long and has been cancelled.', 
          'timeout'
        );
      }
    }
  }, 1000);
}

// Stop progress timer
function stopProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

// Handle cancel button click
async function handleCancelClick() {
  if (!state.canCancel) {
    return;
  }

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

  // Reset UI state
  updateUIState('idle');
  updateStatus('Analysis cancelled');
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

// Success feedback with animation
function showSuccessFeedback(message: string) {
  updateStatus(message);
  
  // Add success animation class if available
  if (statusMessage) {
    statusMessage.classList.add('success-feedback');
    setTimeout(() => {
      statusMessage.classList.remove('success-feedback');
    }, 2000);
  }
}

// Event listeners
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
