/**
 * API interfaces for external service communication
 */

import type { AnalysisResult, AnalysisRequest, ContentExtractionResult } from './models.js';
import type { AnalysisError } from './errors.js';

export interface ToolSchema {
  type: "function";
  name: string;
  description: string;
  parameters: object;
  strict?: boolean;
}

export interface FunctionCallOutput {
  type: "function_call";
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  output?: string;
}

export interface PollinationsRequest {
  model: string;
  prompt: string;
  system: string;
  tools?: ToolSchema[];
}

export interface PollinationsResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  functionCalls?: FunctionCallOutput[];
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
    fact: number;
    opinion: number;
  };
  confidence: number;
  reasoning: {
    factual: string[];
    unfactual: string[];
    subjective: string[];
    objective: string[];
  };
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
// Web search tool schema for use with function calling (Jina s.jina.ai)
export const WEB_SEARCH_TOOL_SCHEMA = {
  type: "function",
  name: "web_search",
  description: "Search the web using Jina s.jina.ai and return the top results.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up on the web."
      }
    },
    required: ["query"],
    additionalProperties: false
  },
  strict: true
};