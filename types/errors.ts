/**
 * Error types and handling for the fact-checking extension
 */

export enum AnalysisErrorType {
  EXTRACTION_FAILED = "extraction_failed",
  API_UNAVAILABLE = "api_unavailable",
  NETWORK_ERROR = "network_error",
  CONTENT_TOO_LONG = "content_too_long",
  INVALID_CONTENT = "invalid_content",
  RATE_LIMITED = "rate_limited",
  // maybe rm
  OTHER = "other",
}

export interface AnalysisError {
  type: AnalysisErrorType;
  message: string;
  retryable: boolean;
  suggestedAction?: string;
}

export class ExtensionError extends Error {
  constructor(
    public type: AnalysisErrorType,
    message: string,
    public retryable: boolean = false,
    public suggestedAction?: string
  ) {
    super(message);
    this.name = "ExtensionError";
  }

  toAnalysisError(): AnalysisError {
    return {
      type: this.type,
      message: this.message,
      retryable: this.retryable,
      suggestedAction: this.suggestedAction,
    };
  }
}

export const createAnalysisError = (
  type: AnalysisErrorType,
  message: string,
  retryable: boolean = false,
  suggestedAction?: string
): AnalysisError => ({
  type,
  message,
  retryable,
  suggestedAction,
});
