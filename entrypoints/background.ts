import type {
  AnalysisResult,
  ContentExtractionResult,
  PopupState,
} from "../types/index.js";
import {
  AnalysisErrorType,
  ExtensionError,
  createAnalysisError,
  type AnalysisError,
} from "../types/index.js";

// Placeholder for iconManager object with required methods
// TODO: Implement iconManager functionality
const iconManager = {
  resetIconForTab(tabId: number) {
    // TODO: implement resetIconForTab
  },
  setAnalyzingState(tabId: number) {
    // TODO: implement setAnalyzingState
  },
  updateIconFromAnalysisResult(tabId: number, analysisResult: any) {
    // TODO: implement updateIconFromAnalysisResult
  },
  setErrorState(tabId: number, message: string) {
    // TODO: implement setErrorState
  },
};

/**
 * Analysis workflow state management
 */
interface AnalysisWorkflow {
  id: string;
  tabId: number;
  url: string;
  status: "idle" | "extracting" | "analyzing" | "complete" | "error";
  startTime: number;
  result?: AnalysisResult;
  error?: AnalysisError;
  retryCount: number;
}

/**
 * Background service for orchestrating fact-checking analysis
 */
class BackgroundService {
  private activeWorkflows = new Map<string, AnalysisWorkflow>();
  private readonly maxRetries = 3;
  private readonly analysisTimeout = 60000; // 60 seconds

  constructor() {
    this.setupMessageHandlers();
    this.setupTabHandlers();
  }

  /**
   * Sets up message handlers for communication between popup, background, and content scripts
   */
  private setupMessageHandlers(): void {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Get tab ID from message (for popup) or sender (for content script)
      const tabId = message.tabId || sender.tab?.id;

      switch (message.action) {
        case "analyze-content":
          this.handleAnalyzeContent(message.data, tabId)
            .then((result) => sendResponse({ success: true, data: result }))
            .catch((error) =>
              sendResponse({
                success: false,
                error: this.formatError(error),
              })
            );
          return true; // Keep message channel open for async response

        case "start-analysis":
          this.handleStartAnalysis(message.data, tabId)
            .then((result) => sendResponse({ success: true, data: result }))
            .catch((error) =>
              sendResponse({
                success: false,
                error: this.formatError(error),
              })
            );
          return true; // Keep message channel open for async response

        case "get-analysis-status":
          const workflow = this.getWorkflowForTab(tabId);
          sendResponse({
            success: true,
            data: this.getWorkflowStatus(workflow),
          });
          return true;

        case "cancel-analysis":
          this.handleCancelAnalysis(tabId)
            .then(() => sendResponse({ success: true }))
            .catch((error) =>
              sendResponse({
                success: false,
                error: this.formatError(error),
              })
            );
          return true;

        case "retry-analysis":
          this.handleRetryAnalysis(sender.tab?.id ?? message.tabId)
            .then((result) => sendResponse({ success: true, data: result }))
            .catch((error) =>
              sendResponse({
                success: false,
                error: this.formatError(error),
              })
            );
          return true;

        default:
          return false;
      }
    });
  }

  /**
   * Sets up tab event handlers for cleanup and state management
   */
  private setupTabHandlers(): void {
    // Clean up workflows when tabs are closed
    browser.tabs.onRemoved.addListener((tabId) => {
      this.cleanupWorkflowForTab(tabId);
    });

    // Reset icon when navigating to new pages
    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.status === "loading" && changeInfo.url) {
        iconManager.resetIconForTab(tabId);
        this.cleanupWorkflowForTab(tabId);
      }
    });
  }

  /**
   * Handles content analysis request from new popup interface
   */
  private async handleAnalyzeContent(
    data: {
      content: string;
      url: string;
      title: string;
      contentType: string;
      extractionMethod: "readability" | "selection";
    },
    tabId?: number
  ): Promise<AnalysisResult> {
    if (!tabId) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "No active tab found for analysis",
        false,
        "Please ensure you have an active tab open"
      );
    }

    // Check if analysis is already in progress for this tab
    const existingWorkflow = this.getWorkflowForTab(tabId);
    if (
      existingWorkflow &&
      ["extracting", "analyzing"].includes(existingWorkflow.status)
    ) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "Analysis already in progress for this tab",
        false,
        "Please wait for the current analysis to complete"
      );
    }

    // Create new workflow
    const workflowId = this.generateWorkflowId();
    const workflow: AnalysisWorkflow = {
      id: workflowId,
      tabId,
      url: data.url,
      status: "analyzing",
      startTime: Date.now(),
      retryCount: 0,
    };

    this.activeWorkflows.set(workflowId, workflow);
    iconManager.setAnalyzingState(tabId);

    try {
      // Create content extraction result from provided data
      const extractedContent: ContentExtractionResult = {
        title: data.title,
        content: data.content,
        url: data.url,
        extractionMethod: data.extractionMethod,
        timestamp: Date.now(),
        last_edited: (data as any).last_edited ?? new Date().toISOString(),
      };

      // Perform analysis
      const analysisResult = await this.performAnalysis(
        extractedContent,
        workflow
      );

      // Update workflow with result
      workflow.status = "complete";
      workflow.result = analysisResult;
      iconManager.updateIconFromAnalysisResult(tabId, analysisResult);

      return analysisResult;
    } catch (error) {
      // Update workflow with error
      const analysisError = this.handleAnalysisError(error);
      workflow.status = "error";
      workflow.error = analysisError;
      iconManager.setErrorState(tabId, analysisError.message);

      throw error;
    }
  }

  /**
   * Handles analysis start request from popup
   */
  private async handleStartAnalysis(
    data: { extractionMethod: "readability" | "selection" },
    tabId?: number
  ): Promise<AnalysisResult> {
    if (!tabId) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "No active tab found for analysis",
        false,
        "Please ensure you have an active tab open"
      );
    }

    // Check if analysis is already in progress for this tab
    const existingWorkflow = this.getWorkflowForTab(tabId);
    if (
      existingWorkflow &&
      ["extracting", "analyzing"].includes(existingWorkflow.status)
    ) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "Analysis already in progress for this tab",
        false,
        "Please wait for the current analysis to complete"
      );
    }

    // Get tab information
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "Unable to access tab URL",
        false,
        "Please refresh the page and try again"
      );
    }

    // Create new workflow
    const workflowId = this.generateWorkflowId();
    const workflow: AnalysisWorkflow = {
      id: workflowId,
      tabId,
      url: tab.url,
      status: "extracting",
      startTime: Date.now(),
      retryCount: 0,
    };

    this.activeWorkflows.set(workflowId, workflow);
    iconManager.setAnalyzingState(tabId);

    try {
      // Extract content from the page
      const extractedContent = await this.extractContent(
        tabId,
        data.extractionMethod
      );

      // Update workflow status
      workflow.status = "analyzing";
      iconManager.setAnalyzingState(tabId);

      // Perform analysis
      const analysisResult = await this.performAnalysis(
        extractedContent,
        workflow
      );

      // Update workflow with result
      workflow.status = "complete";
      workflow.result = analysisResult;
      iconManager.updateIconFromAnalysisResult(tabId, analysisResult);

      return analysisResult;
    } catch (error) {
      // Update workflow with error
      const analysisError = this.handleAnalysisError(error);
      workflow.status = "error";
      workflow.error = analysisError;
      iconManager.setErrorState(tabId, analysisError.message);

      throw error;
    }
  }

  /**
   * Extracts content from the specified tab
   */
  private async extractContent(
    tabId: number,
    method: "readability" | "selection"
  ): Promise<ContentExtractionResult> {
    const action =
      method === "readability"
        ? "extract-article-text"
        : "extract-selected-text";

    try {
      const response = await browser.tabs.sendMessage(tabId, { action });

      if (response.error) {
        throw new ExtensionError(
          AnalysisErrorType.EXTRACTION_FAILED,
          response.error,
          true,
          method === "selection"
            ? "Please select text on the page and try again"
            : "Please try selecting text manually instead"
        );
      }

      return response as ContentExtractionResult;
    } catch (error) {
      if (error instanceof ExtensionError) {
        throw error;
      }

      // Handle content script not available
      if (
        error instanceof Error &&
        error.message.includes("Could not establish connection")
      ) {
        throw new ExtensionError(
          AnalysisErrorType.EXTRACTION_FAILED,
          "Unable to connect to page content",
          true,
          "Please refresh the page and try again"
        );
      }

      throw new ExtensionError(
        AnalysisErrorType.EXTRACTION_FAILED,
        "Failed to extract content from page",
        true,
        "Please refresh the page and try again"
      );
    }
  }

  /**
   * Performs analysis using the api
   */
  private async performAnalysis(
    content: ContentExtractionResult,
    workflow: AnalysisWorkflow
  ): Promise<AnalysisResult> {
    // Use last_edited if available, otherwise fallback to timestamp
    const last_edited =
      content.last_edited || new Date(content.timestamp).toISOString();
    // Set up timeout for analysis
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new ExtensionError(
            AnalysisErrorType.API_UNAVAILABLE,
            "Analysis timed out",
            true,
            "Please try again with shorter content"
          )
        );
      }, this.analysisTimeout);
    });
    try {
      const analysisPromise = (async function analyzeArticle({
        content,
        title,
        url,
        last_edited,
      }: {
        content: string;
        title: string;
        url: string;
        last_edited: Date | string;
      }): Promise<import("../types/index.js").AnalysisResult> {
        const payload = { content, title, url, last_edited };
        const response = await fetch(
          "https://api.falsefact.tranquil.hackclub.app/analyze/article",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }
        return await response.json();
      })({
        content: content.content,
        title: content.title,
        url: content.url,
        last_edited,
      });
      return await Promise.race([analysisPromise, timeoutPromise]);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Handles analysis cancellation
   */
  private async handleCancelAnalysis(tabId?: number): Promise<void> {
    if (!tabId) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "No active tab found",
        false,
        "Please ensure you have an active tab open"
      );
    }

    const workflow = this.getWorkflowForTab(tabId);
    if (!workflow) {
      return; // No workflow to cancel
    }

    // Update workflow status
    workflow.status = "error";
    workflow.error = createAnalysisError(
      AnalysisErrorType.INVALID_CONTENT,
      "Analysis cancelled by user",
      false,
      'Click "Analyze" to start a new analysis'
    );

    iconManager.resetIconForTab(tabId);
  }

  /**
   * Handles analysis retry for a tab
   */
  private async handleRetryAnalysis(tabId?: number): Promise<AnalysisResult> {
    if (!tabId) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "No active tab found for retry",
        false,
        "Please ensure you have an active tab open"
      );
    }
    const workflow = this.getWorkflowForTab(tabId);
    if (!workflow) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        "No previous analysis found to retry",
        false,
        "Please start a new analysis"
      );
    }
    if (workflow.retryCount >= this.maxRetries) {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        "Maximum retry attempts exceeded",
        false,
        "Please try again later or with different content"
      );
    }
    workflow.status = "extracting";
    workflow.error = undefined;
    workflow.startTime = Date.now();
    // Extraction method must be explicit; fallback to 'readability' if not present
    let extractionMethod: "readability" | "selection" = "readability";
    if (workflow.result && "extractionMethod" in workflow.result) {
      extractionMethod =
        (workflow.result as any).extractionMethod ?? "readability";
    } else if ((workflow as any).extractionMethod) {
      extractionMethod = (workflow as any).extractionMethod;
    }
    return await this.handleStartAnalysis({ extractionMethod }, tabId);
  }

  /**
   * Gets workflow for a specific tab
   */
  private getWorkflowForTab(tabId?: number): AnalysisWorkflow | undefined {
    if (!tabId) return undefined;

    for (const workflow of this.activeWorkflows.values()) {
      if (workflow.tabId === tabId) {
        return workflow;
      }
    }

    return undefined;
  }

  /**
   * Gets workflow status for popup
   */
  private getWorkflowStatus(workflow?: AnalysisWorkflow): PopupState {
    if (!workflow) {
      return {
        currentUrl: "",
        analysisStatus: "idle",
        analysisResult: null,
        errorMessage: null,
      };
    }

    return {
      currentUrl: workflow.url,
      analysisStatus: workflow.status,
      analysisResult: workflow.result || null,
      errorMessage: workflow.error?.message || null,
    };
  }

  /**
   * Cleans up workflow for a tab
   */
  private cleanupWorkflowForTab(tabId: number): void {
    const workflowsToRemove: string[] = [];

    for (const [id, workflow] of this.activeWorkflows.entries()) {
      if (workflow.tabId === tabId) {
        workflowsToRemove.push(id);
      }
    }

    workflowsToRemove.forEach((id) => {
      this.activeWorkflows.delete(id);
    });
  }

  /**
   * Handles analysis errors and converts them to appropriate format
   */
  private handleAnalysisError(error: unknown): AnalysisError {
    if (error instanceof ExtensionError) {
      return error.toAnalysisError();
    }

    if (error instanceof Error) {
      return createAnalysisError(
        AnalysisErrorType.API_UNAVAILABLE,
        error.message,
        true,
        "Please try again later"
      );
    }

    return createAnalysisError(
      AnalysisErrorType.API_UNAVAILABLE,
      "Unknown error occurred during analysis",
      true,
      "Please try again later"
    );
  }

  /**
   * Formats error for response
   */
  private formatError(error: unknown): {
    type: string;
    message: string;
    retryable: boolean;
    suggestedAction?: string;
  } {
    const analysisError = this.handleAnalysisError(error);
    return {
      type: analysisError.type,
      message: analysisError.message,
      retryable: analysisError.retryable,
      suggestedAction: analysisError.suggestedAction,
    };
  }

  /**
   * Generates unique workflow ID
   */
  private generateWorkflowId(): string {
    return `workflow_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }
}

// Initialize background service
export default defineBackground(() => {
  console.log("Fact-checking extension background service initialized");
  new BackgroundService();
});
