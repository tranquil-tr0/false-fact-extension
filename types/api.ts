/**
 * API interfaces for external service communication
 */

import type { AnalysisResult, AnalysisRequest, ContentExtractionResult } from './models.js';
import type { AnalysisError } from './errors.js';

export interface PollinationsRequest {
  model: string;
  prompt: string;
  system: string;
}

export interface PollinationsResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

export interface AnalysisApiResponse {
  credibilityScore: number;
  categories: {
    factuality: number;
    objectivity: number;
  };
  confidence: number;
  reasoning: {
    factual: string[];
    unfactual: string[];
    subjective: string[];
    objective: string[];
  };
  sources: string[];
}

export interface ContentScript {
  extractArticleText(): Promise<ContentExtractionResult>;
  extractSelectedText(): Promise<ContentExtractionResult>;
  detectContentType(): 'article' | 'social-media' | 'other';
}

export interface BackgroundService {
  analyzeContent(request: AnalysisRequest): Promise<AnalysisResult>;
  updateIcon(result: AnalysisResult): void;
  cacheResult(url: string, result: AnalysisResult): void;
  getCachedResult(url: string): AnalysisResult | null;
}

export interface PopupController {
  initializePopup(): void;
  handleAnalyzeClick(): Promise<void>;
  renderVisualization(result: AnalysisResult): void;
  showLoadingState(): void;
  showErrorState(message: string): void;
}

export interface PollinationsService {
  analyzeText(text: string): Promise<AnalysisResult>;
  validateApiResponse(response: any): boolean;
  handleApiError(error: Error): AnalysisError;
}

// Re-export types for convenience
export type { AnalysisResult, AnalysisRequest, ContentExtractionResult } from './models.js';
export type { AnalysisError } from './errors.js';