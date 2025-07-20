/**
 * Main types export file for the fact-checking extension
 */

// Core data models
export type {
  AnalysisResult,
  ExtractedContent,
  ContentExtractionResult,
  IconState,
  AnalysisRequest,
  PopupState
} from './models.js';

// Error types
export {
  AnalysisErrorType,
  ExtensionError,
  createAnalysisError
} from './errors.js';
export type { AnalysisError } from './errors.js';

// API interfaces
export type {
  PollinationsRequest,
  PollinationsResponse,
  ApiResponse,
  AnalysisApiResponse,
  ContentScript,
  BackgroundService,
  PopupController,
  PollinationsService
} from './api.js';