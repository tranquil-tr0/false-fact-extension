import "./style.css";
import type { AnalysisResult, ExtractedContent } from "../../types/index.js";
import {
  registerKeyboardShortcuts,
  showKeyboardShortcutsHelp,
  createSkipLink,
  enhanceForHighContrast,
  announceMessage,
  type KeyboardShortcut,
} from "../../utils/accessibility.js";
import { generateContentHash } from "../../utils/content.js";

// State management
type AnalysisStatus =
  | "idle"
  | "extracting"
  | "analyzing"
  | "complete"
  | "error";
interface PopupState {
  currentUrl: string;
  analysisStatus: AnalysisStatus;
  analysisResult: AnalysisResult | null;
  errorMessage: string | null;
  errorType: string | null;
  analysisStartTime: number | null;
  canCancel: boolean;
  lastAnalysisType: "selection" | "article";
}
let state: PopupState = {
  currentUrl: "",
  analysisStatus: "idle",
  analysisResult: null,
  errorMessage: null,
  errorType: null,
  analysisStartTime: null,
  canCancel: false,
  lastAnalysisType: "article",
};

const dom = {
  analyzeBtn: document.getElementById(
    "analyze-btn"
  ) as HTMLButtonElement | null,
  cancelBtn: document.getElementById("cancel-btn") as HTMLButtonElement | null,
  loadingSpinner: document.getElementById("loading-spinner"),
  progressContainer: document.getElementById("progress-container"),
  progressBar: document.getElementById("progress-bar"),
  progressFill: document.getElementById("progress-fill"),
  progressText: document.getElementById("progress-text"),
  progressTime: document.getElementById("progress-time"),
  resultsSection: document.getElementById("results-section"),
  resultDisplay: document.getElementById("result-display"),
  errorSection: document.getElementById("error-section"),
  errorTitle: document.getElementById("error-title"),
  errorDescription: document.getElementById("error-description"),
  retryBtn: document.getElementById("retry-btn") as HTMLButtonElement | null,
  helpBtn: document.getElementById("help-btn") as HTMLButtonElement | null,
  pageUrl: document.getElementById("page-url"),
  analyzeBtnText: document.querySelector("#analyze-btn .button-text"),
  highlightedBtn: document.getElementById(
    "analyze-highlighted-btn"
  ) as HTMLButtonElement | null,
};

// Initialize popup
async function initializePopup() {
  try {
    // Get current tab and URL
    const [tab] = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const currentUrl = tab?.url || "";
    state.currentUrl = currentUrl;

    // Check for selected text in the active tab
    let hasSelection = false;
    let selectedText = "";
    if (tab.id) {
      const selectionResult = await browser.tabs.sendMessage(tab.id, {
        action: "get-selected-text",
      });
      selectedText =
        selectionResult && selectionResult.text
          ? selectionResult.text.trim()
          : "";
      hasSelection = !!selectedText;
    }
    if (dom.pageUrl) dom.pageUrl.textContent = "Ready to analyze";
    if (dom.analyzeBtn) dom.analyzeBtn.disabled = false;
    if (dom.analyzeBtnText) dom.analyzeBtnText.textContent = "Analyze Content";

    if (dom.highlightedBtn) {
      dom.highlightedBtn.style.display = hasSelection ? "" : "none";
      dom.highlightedBtn.onclick = () =>
        handleSelectionAnalysisClick(selectedText);
    }

    // Check for cached readability analysis by URL
    const cachedArticle = await browser.storage.local.get(
      `article_cache_${currentUrl}`
    );
    if (cachedArticle && cachedArticle[`article_cache_${currentUrl}`]) {
      const { analysisResult, contentHash } =
        cachedArticle[`article_cache_${currentUrl}`];
      showResults(analysisResult);
      if (dom.pageUrl) {
        dom.pageUrl.textContent = truncateUrl(state.currentUrl);
      }

      // Add "Check for updates" button
      let checkUpdatesBtn = document.getElementById(
        "check-updates-btn"
      ) as HTMLButtonElement;
      if (!checkUpdatesBtn) {
        checkUpdatesBtn = document.createElement("button");
        checkUpdatesBtn.id = "check-updates-btn";
        checkUpdatesBtn.className = "action-button secondary";
        checkUpdatesBtn.textContent = "Check for updates";
        const actions = document.querySelector(".result-actions");
        if (actions) actions.appendChild(checkUpdatesBtn);
      }
      checkUpdatesBtn.onclick = async () => {
        // Extract current article content
        if (typeof tab.id !== "number") {
          showError(
            "No Active Tab",
            "Please navigate to a webpage to analyze content.",
            "no_tab"
          );
          return;
        }
        const extractionResult: any = await browser.tabs.sendMessage(
          Number(tab.id),
          {
            action: "extract-article-text",
          }
        );
        if (!extractionResult || !extractionResult.content) {
          showError(
            "No Content Found",
            "No analyzable content was found on this page. Try selecting text manually or visit a different page.",
            "no_content"
          );
          return;
        }
        const newHash = generateContentHash(extractionResult.content);
        if (newHash !== contentHash) {
          // Content changed, trigger new analysis
          await analyzeArticle();
        } else {
          checkUpdatesBtn.textContent = "Article is unchanged.";
          sendToast("Article has not been updated. Content is unchanged.");
          setTimeout(() => {
            checkUpdatesBtn.textContent = "Check for updates";
          }, 2000);
        }
      };
    }
  } catch (error) {
    console.error("Failed to initialize popup:", error);
    showError(
      "Initialization Error",
      "Failed to initialize the extension. Please try again.",
      "init_error"
    );
  }
}

/**
 * Adjusts the gap of .popup-main based on .analyze-section height.
 */
function adjustPopupMainGap() {
  const analyzeSection = document.querySelector(
    ".analyze-section"
  ) as HTMLElement | null;
  const popupMain = document.querySelector(".popup-main") as HTMLElement | null;
  if (analyzeSection && popupMain) {
    if (analyzeSection.offsetHeight === 0) {
      popupMain.style.gap = "0px";
    } else {
      popupMain.style.gap = "20px";
    }
  }
}

/**
 * handleSelectionAnalysisClick
 * @param selectedText - The text to analyze (from selection)
 */
async function handleSelectionAnalysisClick(selectedText: string) {
  state.lastAnalysisType = "selection";
  try {
    if (!selectedText) {
      showError(
        "No Highlighted Text",
        "No highlighted text was found. Please select text and try again.",
        "no_highlighted_text"
      );
      return;
    }

    // --- Caching logic for highlighted text ---
    const highlightedHash = generateContentHash(selectedText);
    const cachedSelection = await browser.storage.local.get(
      `selection_cache_${highlightedHash}`
    );
    if (
      cachedSelection &&
      cachedSelection[`selection_cache_${highlightedHash}`]
    ) {
      showResults(cachedSelection[`selection_cache_${highlightedHash}`]);
      return;
    } else {
      analyzeSelectedText();
    }
  } catch (error) {
    showError(
      "Failed to check for cached selection",
      "An unexpected error occurred while checking for cached selection. Please try again.",
      "unexpected_error"
    );
  }
}

/**
 * Analyze highlighted text handler.
 * @param textToBeAnalyzed - The text to analyze (from selection)
 */
async function analyzeSelectedText() {
  updateUIState("extracting");
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab.id) {
      showError(
        "No Active Tab",
        "Please navigate to a webpage to analyze content.",
        "no_tab"
      );
      return;
    }
    const selectedText: ExtractedContent = await browser.tabs.sendMessage(
      tab.id,
      {
        action: "extract-selected-text",
      }
    );

    console.log("Selected text for analysis:", selectedText);

    state.currentUrl = tab.url || "";
    if (dom.pageUrl) {
      dom.pageUrl.textContent = truncateUrl(state.currentUrl);
    }
    // Show initial progress animation
    if (dom.progressBar) {
      dom.progressBar.classList.add("indeterminate");
    }
    // Use selectedText for extraction
    if (!selectedText) {
      showError(
        "No Highlighted Text",
        "No highlighted text was found. Please select text and try again.",
        "no_highlighted_text"
      );
      return;
    }

    const selectionHash = generateContentHash(selectedText.content);

    // Update UI to analyzing state
    updateUIState("analyzing");
    if (dom.progressBar) {
      dom.progressBar.classList.remove("indeterminate");
    }
    updateProgress(60, "Analyzing highlighted text for credibility...");
    // Send to background script for analysis
    const analysisResult = await browser.runtime.sendMessage({
      action: "analyze-content",
      tabId: tab.id,
      data: selectedText,
    });
    if (analysisResult.success) {
      updateProgress(100, "Analysis complete");
      sendToast("Analysis complete");
      showResults(analysisResult.data);
      // Cache result
      await browser.storage.local.set({
        [`selection_cache_${selectionHash}`]: analysisResult.data,
      });
    } else {
      const error = analysisResult.error;
      const errorType = error?.type || "analysis_failed";
      const errorMessage =
        error?.message || "Analysis failed. Please try again.";
      const suggestedAction = error?.suggestedAction;
      handleAnalysisError(
        errorType,
        errorMessage,
        suggestedAction,
        error?.retryable
      );
    }
  } catch (error) {
    showError(
      "Analysis Error",
      "An unexpected error occurred during analysis. Please try again.",
      "unexpected_error"
    );
  }
}

// Update UI state with enhanced progress indicators
function updateUIState(newStatus: PopupState["analysisStatus"]) {
  const previousStatus = state.analysisStatus;
  state.analysisStatus = newStatus;

  // Hide all sections first
  if (dom.resultsSection) dom.resultsSection.classList.add("hidden");
  if (dom.errorSection) dom.errorSection.classList.add("hidden");

  // Update progress stages
  updateProgressStages(newStatus);

  switch (newStatus) {
    case "idle":
      if (dom.analyzeBtn) dom.analyzeBtn.disabled = false;
      if (dom.analyzeBtn) dom.analyzeBtn.classList.remove("loading");
      if (dom.analyzeBtnText)
        dom.analyzeBtnText.textContent = "Analyze Content";
      if (dom.loadingSpinner) dom.loadingSpinner.classList.add("hidden");
      if (dom.progressContainer) dom.progressContainer.classList.add("hidden");
      if (dom.cancelBtn) dom.cancelBtn.classList.add("hidden");
      state.canCancel = false;
      state.analysisStartTime = null;
      stopProgressTimer();
      sendToast("Ready to analyze content");
      break;

    case "extracting":
      if (dom.analyzeBtn) dom.analyzeBtn.disabled = true;
      if (dom.analyzeBtn) dom.analyzeBtn.classList.add("loading");
      if (dom.analyzeBtnText) dom.analyzeBtnText.textContent = "Extracting...";
      if (dom.loadingSpinner) dom.loadingSpinner.classList.remove("hidden");
      if (dom.progressContainer)
        dom.progressContainer.classList.remove("hidden");
      if (dom.cancelBtn) dom.cancelBtn.classList.remove("hidden");
      state.canCancel = true;
      state.analysisStartTime = Date.now();

      // Show indeterminate progress initially
      if (dom.progressBar) {
        dom.progressBar.classList.add("indeterminate");
      }

      updateProgress(20, "Extracting content from page...");
      startProgressTimer();
      sendToast("Extracting content from page...");

      // Add pulsing effect to progress text
      if (dom.progressText) {
        dom.progressText.classList.add("pulsing");
      }
      break;

    case "analyzing":
      if (dom.analyzeBtn) dom.analyzeBtn.disabled = true;
      if (dom.analyzeBtn) dom.analyzeBtn.classList.add("loading");
      if (dom.analyzeBtnText) dom.analyzeBtnText.textContent = "Analyzing...";
      if (dom.loadingSpinner) dom.loadingSpinner.classList.remove("hidden");
      if (dom.progressContainer)
        dom.progressContainer.classList.remove("hidden");
      if (dom.cancelBtn) dom.cancelBtn.classList.remove("hidden");
      state.canCancel = true;

      // Switch from indeterminate to determinate progress
      if (dom.progressBar) {
        dom.progressBar.classList.remove("indeterminate");
      }

      // Animate progress transition
      updateProgress(60, "Analyzing content for credibility...");
      sendToast("Analyzing content for credibility...");

      // Show success transition from previous state if applicable
      if (previousStatus === "extracting") {
        sendToast("Content extracted successfully");
      }
      break;

    case "complete":
      if (dom.analyzeBtn) dom.analyzeBtn.classList.add("hidden");
      if (dom.analyzeBtn) dom.analyzeBtn.disabled = false;
      if (dom.analyzeBtn) dom.analyzeBtn.classList.remove("loading");
      if (dom.loadingSpinner) dom.loadingSpinner.classList.add("hidden");
      if (dom.progressContainer) dom.progressContainer.classList.add("hidden");
      if (dom.cancelBtn) dom.cancelBtn.classList.add("hidden");
      if (dom.resultsSection) dom.resultsSection.classList.remove("hidden");
      state.canCancel = false;
      stopProgressTimer();
      updateProgress(100, "Analysis complete");

      // gap between the highted text button and the results panel (in analysis section)
      adjustPopupMainGap();

      // Add entrance animation to results
      if (dom.resultsSection) {
        dom.resultsSection.style.animation = "fadeIn 0.5s ease-out";
      }
      break;

    case "error":
      if (dom.analyzeBtn) dom.analyzeBtn.disabled = false;
      if (dom.analyzeBtn) dom.analyzeBtn.classList.remove("loading");
      if (dom.analyzeBtnText) dom.analyzeBtnText.textContent = "Try Again";
      if (dom.loadingSpinner) dom.loadingSpinner.classList.add("hidden");
      if (dom.progressContainer) dom.progressContainer.classList.add("hidden");
      if (dom.cancelBtn) dom.cancelBtn.classList.add("hidden");
      if (dom.errorSection) dom.errorSection.classList.remove("hidden");
      state.canCancel = false;
      stopProgressTimer();
      sendToast("Analysis failed");

      // Add entrance animation to error section
      if (dom.errorSection) {
        dom.errorSection.style.animation = "fadeIn 0.4s ease-out";
      }
      break;
  }
}

/**
 * Show a toast notification with the given message.
 */
function sendToast(message: string) {
  const toast = document.getElementById("toast-notification");
  if (!toast) return;
  toast.textContent = message;
  toast.removeAttribute("hidden");

  // Remove any previous timeout and animation classes
  if ((toast as any)._toastTimeout) {
    clearTimeout((toast as any)._toastTimeout);
  }
  toast.classList.remove("slide-out-bottom");
  // Force reflow to restart animation if needed
  void (toast as HTMLElement).offsetWidth;
  toast.classList.add("slide-in-bottom");

  announceMessage(message);

  (toast as any)._toastTimeout = setTimeout(() => {
    toast.classList.remove("slide-in-bottom");
    toast.classList.add("slide-out-bottom");
    (toast as any)._toastTimeout = null;
    // Hide after animation
    setTimeout(() => {
      toast.setAttribute("hidden", "");
      toast.classList.remove("slide-out-bottom");
    }, 250);
  }, 2000);
}

// Show error state
function showError(title: string, description: string, type: string) {
  state.errorMessage = description;
  state.errorType = type;
  if (dom.errorTitle) dom.errorTitle.textContent = title;
  if (dom.errorDescription) dom.errorDescription.textContent = description;
  updateUIState("error");
}

// Show results with visualization and enhanced feedback
function showResults(analysisResult: AnalysisResult) {
  state.analysisResult = analysisResult;

  // Create results display HTML
  const resultsHTML = createResultsHTML(analysisResult);
  if (dom.resultDisplay) dom.resultDisplay.innerHTML = resultsHTML;
  attachSourceLinkListeners(analysisResult.sources);

  // Update UI state to complete
  updateUIState("complete");

  // Add highlight animation to results with a slight delay for better visual feedback
  setTimeout(() => {
    // Find and animate the credibility score
    if (dom.resultDisplay) {
      const scoreElement =
        dom.resultDisplay.querySelector(".credibility-score");
      if (scoreElement) {
        scoreElement.classList.add("highlight-animation");
      }
    }

    // Animate category bars sequentially
    if (dom.resultDisplay) {
      const categoryBars = dom.resultDisplay.querySelectorAll(".category-fill");
      categoryBars.forEach((element: Element, index: number) => {
        const bar = element as HTMLElement;
        setTimeout(() => {
          // Force a reflow to restart the animation
          bar.style.width = "0%";

          // Set the actual width after a tiny delay
          setTimeout(() => {
            const percentage =
              bar.parentElement?.nextElementSibling?.textContent || "0%";
            bar.style.width = percentage;
          }, 50);
        }, index * 200); // Stagger the animations
      });
    }
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
            <div class="category-fill fact" style="width: ${
              result.categories.factuality
            }%"></div>
          </div>
          <div class="category-percentage">${
            result.categories.factuality
          }%</div>
        </div>
        
        <div class="category-item">
          <div class="category-label">Objectivity</div>
          <div class="category-bar">
            <div class="category-fill opinion" style="width: ${
              result.categories.objectivity
            }%"></div>
          </div>
          <div class="category-percentage">${
            result.categories.objectivity
          }%</div>
        </div>
        
      </div>
      
      <div class="reasoning-section">
        <div class="reasoning-header">Analysis Reasoning</div>
        <div class="reasoning-content">${formatReasoning(
          result.reasoning,
          result.sources
        )}</div>
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
  if (score >= 80) return "High Credibility";
  if (score >= 60) return "Moderate Credibility";
  if (score >= 40) return "Low Credibility";
  return "Very Low Credibility";
}

// Get color for credibility level
function getCredibilityColor(level: string): string {
  switch (level) {
    case "High Credibility":
      return "var(--success-color)";
    case "Moderate Credibility":
      return "var(--warning-color)";
    case "Low Credibility":
      return "var(--error-color)";
    case "Very Low Credibility":
      return "var(--error-color)";
    default:
      return "var(--text-secondary)";
  }
}

// Format reasoning object for display
function formatReasoning(
  reasoning: {
    factual: string[];
    unfactual: string[];
    subjective: string[];
    objective: string[];
  },
  sources?: string[]
): string {
  type ReasoningKey = keyof typeof reasoning;
  const sections: { label: string; key: ReasoningKey }[] = [
    { label: "Factual", key: "factual" },
    { label: "Unfactual", key: "unfactual" },
    { label: "Subjective", key: "subjective" },
    { label: "Objective", key: "objective" },
  ];

  function linkifySources(reason: string, sources?: string[]): string {
    return reason.replace(/\[([0-9,\s]+)\]/g, (match, nums) => {
      const buttons = (nums as string)
        .split(",")
        .map((n: string) => n.trim())
        .filter((n: string) => n.length > 0)
        .map(
          (num: string) =>
            `<button class="source-link-btn" data-source="${num}" aria-label="Open source ${num}">${num}</button>`
        )
        .join("");
      return buttons;
    });
  }

  return sections
    .map(({ label, key }) =>
      Array.isArray(reasoning[key]) && reasoning[key].length
        ? `<div class="reasoning-subsection">
              <div class="reasoning-subheader">${label} Reasons</div>
              <ul>${(reasoning[key] as string[])
                .map(
                  (reason: string) =>
                    `<li>${linkifySources(reason, sources)}</li>`
                )
                .join("")}</ul>
            </div>`
        : ""
    )
    .join("");
}

function attachSourceLinkListeners(sources?: string[]) {
  document
    .querySelectorAll<HTMLButtonElement>(".source-link-btn")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = btn.getAttribute("data-source");
        if (!num || !sources) return;
        const idx = parseInt(num, 10) - 1;
        if (idx >= 0 && idx < sources.length) {
          let url = sources[idx];
          const mdMatch = /^\s*\[\s*\d+\s*\]\((.*?)\)\s*$/.exec(url);
          if (mdMatch && mdMatch[1]) {
            url = mdMatch[1].trim();
          }
          browser.tabs.create({ url });
        }
      });
    });
}

// Handle analyze button click with enhanced error recovery and progress feedback
async function analyzeArticle() {
  state.lastAnalysisType = "article";
  if (
    state.analysisStatus !== "idle" &&
    state.analysisStatus !== "error" &&
    state.analysisStatus !== "complete"
  ) {
    return; // Already processing
  }

  try {
    // Reset any previous analysis state
    if (
      state.analysisStatus === "error" ||
      state.analysisStatus === "complete"
    ) {
      // Brief transition to idle state for visual feedback
      updateUIState("idle");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    updateUIState("extracting");

    // Get current active tab
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab.id) {
      showError(
        "No Active Tab",
        "Please navigate to a webpage to analyze content.",
        "no_tab"
      );
      return;
    }

    // Store current URL for reference
    state.currentUrl = tab.url || "";
    if (dom.pageUrl) {
      dom.pageUrl.textContent = truncateUrl(state.currentUrl);
    }

    // Show initial progress animation
    if (dom.progressBar) {
      dom.progressBar.classList.add("indeterminate");
    }

    // Extract content from page using content script with timeout handling
    let extractionResult;
    try {
      // Create a promise that rejects after a timeout
      const extractionTimeout = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Content extraction timed out")),
          15000
        );
      });

      // Race the extraction against the timeout
      extractionResult = await Promise.race([
        browser.tabs.sendMessage(tab.id, {
          action: "extract-article-text",
        }),
        extractionTimeout,
      ]);

      // Update progress after successful extraction
      updateProgress(40, "Content extracted successfully");

      // Show brief success message
      sendToast("Content extracted successfully");
    } catch (error) {
      console.error("Content extraction failed:", error);

      // Check if it's a timeout error
      const err = error as Error;
      if (err.message === "Content extraction timed out") {
        showError(
          "Extraction Timeout",
          "Content extraction took too long. The page may be too large or complex.",
          "extraction_timeout"
        );
      } else {
        showError(
          "Content Extraction Failed",
          "Unable to extract content from this page. The page may not support content extraction or may be loading.",
          "extraction_failed"
        );
      }
      return;
    }

    if (!extractionResult || !extractionResult.content) {
      showError(
        "No Content Found",
        "No analyzable content was found on this page. Try selecting text manually or visit a different page.",
        "no_content"
      );
      return;
    }

    const contentHash = generateContentHash(extractionResult.content);

    // Update UI to analyzing state with smooth transition
    updateUIState("analyzing");

    // Switch from indeterminate to determinate progress
    if (dom.progressBar) {
      dom.progressBar.classList.remove("indeterminate");
    }

    // Update progress to show we're starting analysis
    updateProgress(60, "Analyzing content for credibility...");

    // Send to background script for analysis with tab ID and cancellation support
    try {
      const analysisResult = await browser.runtime.sendMessage({
        action: "analyze-content",
        tabId: tab.id, // Include tab ID in the message
        data: extractionResult,
      });

      if (analysisResult.success) {
        // Update progress to show completion
        updateProgress(100, "Analysis complete");

        // Check if this is a fallback result and inform user
        if (analysisResult.data.confidence <= 30) {
          const reasoningStr = JSON.stringify(analysisResult.data.reasoning);
          if (reasoningStr && reasoningStr.includes("Fallback analysis")) {
            sendToast(
              "Analysis completed with limited service - results may be less accurate"
            );
          } else {
            // Show success animation
            sendToast("Analysis complete");
          }
        } else {
          // Show success animation
          sendToast("Analysis complete");
        }

        // Show results with highlight animation
        showResults(analysisResult.data);

        // Article cache: key by URL, value includes contentHash and result.
        await browser.storage.local.set({
          [`article_cache_${state.currentUrl}`]: {
            url: state.currentUrl,
            contentHash,
            analysisResult: analysisResult.data,
          },
        });
      } else {
        const error = analysisResult.error;
        const errorType = error?.type || "analysis_failed";
        const errorMessage =
          error?.message || "Analysis failed. Please try again.";
        const suggestedAction = error?.suggestedAction;

        // Provide more specific error handling based on error type
        handleAnalysisError(
          errorType,
          errorMessage,
          suggestedAction,
          error?.retryable
        );
      }
    } catch (error) {
      // Check if this was a user-initiated cancellation
      if (state.analysisStatus === "idle") {
        // User already cancelled, no need to show error
        return;
      }

      console.error("Analysis failed:", error);
      showError(
        "Analysis Error",
        "An unexpected error occurred during analysis. Please try again.",
        "unexpected_error"
      );
    }
  } catch (error) {
    console.error("Analysis failed:", error);
    showError(
      "Analysis Error",
      "An unexpected error occurred during analysis. Please try again.",
      "unexpected_error"
    );
  }
}

// Enhanced error handling with recovery suggestions
function handleAnalysisError(
  errorType: string,
  errorMessage: string,
  suggestedAction?: string,
  retryable?: boolean
) {
  let title = "Analysis Failed";
  let description = errorMessage;
  let actionText = suggestedAction || "Please try again.";

  switch (errorType) {
    case "network_error":
      title = "Network Connection Issue";
      description = "Unable to connect to the analysis service.";
      actionText = "Please check your internet connection and try again.";
      break;

    case "rate_limited":
      title = "Too Many Requests";
      description = "The analysis service is temporarily limiting requests.";
      actionText = "Please wait a moment and try again.";
      // Auto-retry after delay for rate limits
      if (retryable) {
        setTimeout(() => {
          if (state.analysisStatus === "error") {
            sendToast("Retrying analysis...");
            setTimeout(() => analyzeArticle(), 1000);
          }
        }, 5000);
      }
      break;

    case "api_unavailable":
      title = "Service Temporarily Unavailable";
      description = "The analysis service is currently unavailable.";
      actionText =
        "Please try again in a few minutes. Some results may use fallback analysis.";
      break;

    case "invalid_content":
      title = "Content Cannot Be Analyzed";
      description = errorMessage;
      actionText =
        suggestedAction ||
        "Please try selecting different text or visit another page.";
      break;

    case "extraction_failed":
      title = "Content Extraction Failed";
      description = "Unable to extract text from this page.";
      actionText = "Try refreshing the page or selecting text manually.";
      break;

    case "content_too_long":
      title = "Content Too Long";
      description = "The selected content is too long for analysis.";
      actionText = "Please select a shorter portion of text to analyze.";
      break;

    default:
      title = "Analysis Error";
      description = errorMessage || "An unexpected error occurred.";
      actionText = suggestedAction || "Please try again later.";
  }

  // Show enhanced error message
  showError(title, `${description} ${actionText}`, errorType);
}

// Handle retry button click
function handleRetryClick() {
  updateUIState("idle");
}

// Handle help button click
function handleHelpClick() {
  const helpMessages: Record<string, string> = {
    no_tab: "Make sure you have an active tab open with a webpage.",
    unsupported_page: "Try navigating to a news article or social media post.",
    extraction_failed:
      "Refresh the page and try again, or try a different website.",
    no_content:
      "Make sure the page has loaded completely, or try selecting text manually.",
    analysis_failed: "Check your internet connection and try again.",
    api_unavailable:
      "The analysis service is temporarily unavailable. Please try again later.",
    network_error: "Check your internet connection and try again.",
    rate_limited: "Too many requests. Please wait a moment and try again.",
    content_too_long:
      "The content is too long to analyze. Try selecting a smaller portion.",
    unexpected_error:
      "Try refreshing the extension or restarting your browser.",
  };

  const helpMessage =
    helpMessages[state.errorType || "unexpected_error"] ||
    helpMessages["unexpected_error"];

  // Show help message in status
  sendToast(`Help: ${helpMessage}`);

  // Reset status after 5 seconds
  setTimeout(() => {
    if (state.analysisStatus === "error") {
      sendToast("Analysis failed");
    }
  }, 5000);
}

// Handle share results action
function handleShareResults() {
  if (!state.analysisResult) return;

  const shareText =
    `Fact-check results for ${state.currentUrl}:\n` +
    `Credibility: ${state.analysisResult.credibilityScore}%\n` +
    `Factuality: ${state.analysisResult.categories.factuality}% | ` +
    `Objectivity: ${state.analysisResult.categories.objectivity}%`;

  // Copy to clipboard
  navigator.clipboard
    .writeText(shareText)
    .then(() => {
      sendToast("Results copied to clipboard");
    })
    .catch(() => {
      sendToast("Failed to copy results");
    });
}

// Progress tracking variables
let progressTimer: number | null = null;
let timeoutTimer: number | null = null;
const SHORT_TIMEOUT = 30000; // 30 seconds
const LONG_TIMEOUT = 60000; // 60 seconds

// Update progress indicator with enhanced visual feedback
function updateProgress(percentage: number, message: string) {
  if (dom.progressFill) {
    // Use smooth animation for progress updates
    dom.progressFill.style.width = `${percentage}%`;
  }

  if (dom.progressText) {
    // Animate text change
    dom.progressText.style.opacity = "0";

    setTimeout(() => {
      if (dom.progressText) {
        dom.progressText.textContent = message;
        dom.progressText.style.opacity = "1";
      }
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
    if (state.analysisStartTime && dom.progressTime) {
      const elapsed = Math.floor((Date.now() - state.analysisStartTime) / 1000);
      dom.progressTime.textContent = `${elapsed}s`;

      // Add warning class when approaching timeout
      if (elapsed >= 20) {
        dom.progressTime.classList.add("warning");
      } else {
        dom.progressTime.classList.remove("warning");
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
  if (dom.progressTime) {
    dom.progressTime.classList.remove("warning");
  }
}

// Set up timeout handling with user notifications
function setupTimeoutHandling() {
  // First timeout: Warning notification
  setTimeout(() => {
    if (
      state.analysisStatus === "extracting" ||
      state.analysisStatus === "analyzing"
    ) {
      // Show warning notification
      showTimeoutWarning();
    }
  }, SHORT_TIMEOUT - 5000); // 5 seconds before short timeout

  // Short timeout: Consider showing partial results
  setTimeout(() => {
    if (state.analysisStatus === "analyzing") {
      // If in analyzing phase for too long, show notification
      sendToast("Analysis is taking longer than expected...");
    }
  }, SHORT_TIMEOUT);

  // Final timeout: Auto-cancel
  timeoutTimer = window.setTimeout(() => {
    if (
      state.analysisStatus === "extracting" ||
      state.analysisStatus === "analyzing"
    ) {
      handleCancelClick();
      showError(
        "Analysis Timeout",
        "The analysis took too long and was automatically cancelled. Try with shorter content or try again later.",
        "timeout"
      );
    }
  }, LONG_TIMEOUT);
}

// Show timeout warning with option to continue or cancel
function showTimeoutWarning() {
  // Create warning element
  const warningElement = document.createElement("div");
  warningElement.className = "timeout-warning";
  warningElement.innerHTML = `
    <div class="warning-message">
      <span>Analysis is taking longer than expected</span>
      <button class="continue-button">Continue</button>
    </div>
  `;

  // Add to progress container
  if (dom.progressContainer) {
    dom.progressContainer.appendChild(warningElement);

    // Add show class after a small delay for animation
    setTimeout(() => {
      warningElement.classList.add("show");
    }, 10);

    // Add event listener to continue button
    const continueButton = warningElement.querySelector(".continue-button");
    if (continueButton) {
      continueButton.addEventListener("click", () => {
        // Remove warning and extend timeout
        warningElement.classList.remove("show");
        setTimeout(() => {
          if (
            dom.progressContainer &&
            dom.progressContainer.contains(warningElement)
          ) {
            dom.progressContainer.removeChild(warningElement);
          }
        }, 300);

        // Reset timeout timer to give more time
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = window.setTimeout(() => {
            if (
              state.analysisStatus === "extracting" ||
              state.analysisStatus === "analyzing"
            ) {
              handleCancelClick();
              showError(
                "Analysis Timeout",
                "The analysis took too long and was automatically cancelled.",
                "timeout"
              );
            }
          }, LONG_TIMEOUT);
        }
      });
    }

    // Auto-remove after 10 seconds if not clicked
    setTimeout(() => {
      if (
        dom.progressContainer &&
        dom.progressContainer.contains(warningElement)
      ) {
        warningElement.classList.remove("show");
        setTimeout(() => {
          if (
            dom.progressContainer &&
            dom.progressContainer.contains(warningElement)
          ) {
            dom.progressContainer.removeChild(warningElement);
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
  if (dom.cancelBtn) dom.cancelBtn.disabled = true;
  if (dom.cancelBtn) dom.cancelBtn.textContent = "Cancelling...";

  try {
    // Send cancellation message to background script
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab.id) {
      await browser.runtime.sendMessage({
        action: "cancel-analysis",
        tabId: tab.id,
      });
    }
  } catch (error) {
    console.warn("Failed to cancel analysis:", error);
  }

  // Reset UI state with cancellation feedback
  updateUIState("idle");
  sendToast("Analysis cancelled by user");

  // Show brief cancellation message
  const feedbackElement = document.createElement("div");
  feedbackElement.className = "cancellation-feedback";
  feedbackElement.textContent = "Analysis cancelled";

  // Add to analyze section
  const analyzeSection = document.querySelector(".analyze-section");
  if (analyzeSection) {
    analyzeSection.appendChild(feedbackElement);

    // Animate and remove
    setTimeout(() => {
      feedbackElement.classList.add("show");

      setTimeout(() => {
        feedbackElement.classList.remove("show");
        setTimeout(() => {
          if (analyzeSection.contains(feedbackElement)) {
            analyzeSection.removeChild(feedbackElement);
          }
        }, 300);
      }, 2000);
    }, 10);
  }

  // Reset cancel button state
  if (dom.cancelBtn) dom.cancelBtn.disabled = false;
  if (dom.cancelBtn) dom.cancelBtn.textContent = "Cancel";
}

// Cleanup on popup close
window.addEventListener("beforeunload", () => {
  stopProgressTimer();
});

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  const shortcuts: KeyboardShortcut[] = [
    {
      key: "a",
      description: "Analyze content",
      action: () => {
        if (dom.analyzeBtn && !dom.analyzeBtn.disabled) {
          analyzeArticle();
        }
      },
    },
    {
      key: "c",
      description: "Cancel analysis",
      action: () => {
        if (
          state.canCancel &&
          dom.cancelBtn &&
          !dom.cancelBtn.classList.contains("hidden")
        ) {
          handleCancelClick();
        }
      },
    },
    {
      key: "r",
      description: "Retry analysis",
      action: () => {
        if (state.analysisStatus === "error") {
          handleRetryClick();
          analyzeArticle();
        }
      },
    },
    {
      key: "s",
      description: "Share results",
      action: () => {
        if (state.analysisStatus === "complete" && state.analysisResult) {
          handleShareResults();
        }
      },
    },
    {
      key: "h",
      description: "Show help",
      action: () => {
        showKeyboardShortcutsHelp(shortcuts);
      },
      modifier: "alt",
    },
    {
      key: "Escape",
      description: "Cancel analysis or close dialogs",
      action: () => {
        if (state.canCancel) {
          handleCancelClick();
        }
        // Close any open dialogs
        const dialog = document.querySelector(".keyboard-shortcuts-help");
        if (dialog) {
          dialog.remove();
        }
      },
    },
  ];

  registerKeyboardShortcuts(shortcuts);
}

// Update progress stages indicator with ARIA attributes
function updateProgressStages(currentStatus: PopupState["analysisStatus"]) {
  // Get all stage elements
  const stageExtract = document.getElementById("stage-extract");
  const stageAnalyze = document.getElementById("stage-analyze");
  const stageComplete = document.getElementById("stage-complete");

  // Reset all stages
  [stageExtract, stageAnalyze, stageComplete].forEach((stage) => {
    if (stage) {
      stage.classList.remove("active", "completed");
    }
  });

  // Update stages based on current status
  switch (currentStatus) {
    case "extracting":
      if (stageExtract) {
        stageExtract.classList.add("active");
        stageExtract.setAttribute("aria-current", "step");
      }
      break;

    case "analyzing":
      if (stageExtract) {
        stageExtract.classList.add("completed");
        stageExtract.removeAttribute("aria-current");
      }
      if (stageAnalyze) {
        stageAnalyze.classList.add("active");
        stageAnalyze.setAttribute("aria-current", "step");
      }
      break;

    case "complete":
      if (stageExtract && stageAnalyze) {
        stageExtract.classList.add("completed");
        stageAnalyze.classList.add("completed");
        stageExtract.removeAttribute("aria-current");
        stageAnalyze.removeAttribute("aria-current");
      }
      if (stageComplete) {
        stageComplete.classList.add("active", "completed");
        stageComplete.setAttribute("aria-current", "step");
      }
      break;
  }

  // Update ARIA attributes for progress container
  if (dom.progressContainer) {
    // Update aria-valuenow based on status
    let progressValue = 0;
    switch (currentStatus) {
      case "extracting":
        progressValue = 20;
        break;
      case "analyzing":
        progressValue = 60;
        break;
      case "complete":
        progressValue = 100;
        break;
    }
    dom.progressContainer.setAttribute(
      "aria-valuenow",
      progressValue.toString()
    );
  }
}

// Truncate URL for display
function truncateUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    let displayUrl = urlObj.hostname + urlObj.pathname;
    if (displayUrl.length > 40) {
      displayUrl = displayUrl.substring(0, 37) + "...";
    }
    return displayUrl;
  } catch (e) {
    return url.length > 40 ? url.substring(0, 37) + "..." : url;
  }
}

function handleAnalyzeAgain() {
  if (state.lastAnalysisType === "article") {
    analyzeArticle();
  } else {
    analyzeSelectedText();
  }
}

// Setup result interactions with keyboard navigation
function setupResultInteractions() {
  // Add event listeners to expandable sections
  const expandableSections = document.querySelectorAll(
    ".reasoning-subheader.expandable"
  );
  expandableSections.forEach((section) => {
    section.addEventListener("click", () => {
      const isExpanded = section.classList.contains("expanded");
      section.classList.toggle("expanded");
      section.setAttribute("aria-expanded", (!isExpanded).toString());

      const content = section.nextElementSibling as HTMLElement;
      if (content && content.classList.contains("reasoning-content")) {
        content.classList.toggle("collapsed");
      }
    });

    // Add keyboard support
    section.setAttribute("tabindex", "0");
    section.setAttribute("role", "button");
    section.setAttribute("aria-expanded", "false");

    section.addEventListener("keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key === "Enter" || ke.key === " ") {
        ke.preventDefault();
        (section as HTMLElement).click();
      }
    });
  });

  // Add event listeners to action buttons
  const analyzeAgainBtn = document.getElementById("analyze-again-btn");
  const shareResultsBtn = document.getElementById("share-results-btn");

  if (analyzeAgainBtn) {
    analyzeAgainBtn.addEventListener("click", async () => {
      analyzeAgainBtn.classList.add("clicked");
      setTimeout(async () => {
        analyzeAgainBtn.classList.remove("clicked");
        handleAnalyzeAgain();
      }, 200);
    });

    analyzeAgainBtn.setAttribute("aria-label", "Analyze content again");
  }

  if (shareResultsBtn) {
    shareResultsBtn.addEventListener("click", () => {
      shareResultsBtn.classList.add("clicked");
      setTimeout(() => {
        shareResultsBtn.classList.remove("clicked");
        handleShareResults();
      }, 200);
    });

    // Add keyboard accessibility
    shareResultsBtn.setAttribute("aria-label", "Share analysis results");
  }
}

// Add skip link for keyboard navigation
function addSkipLink() {
  const skipLink = createSkipLink("result-display", "Skip to analysis results");
  document.body.insertBefore(skipLink, document.body.firstChild);
}

// Initialize accessibility features
function initializeAccessibility() {
  // Add skip link for keyboard navigation
  addSkipLink();

  // Setup keyboard shortcuts
  //setupKeyboardShortcuts();

  // Check for high contrast mode
  enhanceForHighContrast();
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  // Initialize popup
  initializePopup();
  // Initialize accessibility features
  initializeAccessibility();

  // Add event listeners
  if (dom.analyzeBtn) dom.analyzeBtn.addEventListener("click", analyzeArticle);
  if (dom.cancelBtn) dom.cancelBtn.addEventListener("click", handleCancelClick);
  if (dom.retryBtn)
    dom.retryBtn.addEventListener("click", () => {
      handleRetryClick();
      handleAnalyzeAgain();
    });
  if (dom.helpBtn) dom.helpBtn.addEventListener("click", handleHelpClick);
});
