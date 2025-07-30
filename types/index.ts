/**
 * Main types export file for the fact-checking extension
 */

// Core data models
export type {
  AnalysisResult,
  ExtractedContent,
  IconState,
  AnalysisRequest,
  PopupState,
  AnalysisResponse,
} from "./models.js";

// Error types
export {
  AnalysisErrorType,
  ExtensionError,
  createAnalysisError,
} from "./errors.js";
export type { AnalysisError } from "./errors.js";
