/**
 * Core data models for the fact-checking extension
 */

export interface AnalysisResult {
  id: string;
  url: string;
  title: string;
  credibilityScore: number; // Overall score 0-100
  categories: {
    factuality: number; // Percentage 0-100
    objectivity: number; // Percentage 0-100
  };
  confidence: number; // AI confidence 0-100
  reasoning: {
    factual: string[];
    unfactual: string[];
    subjective: string[];
    objective: string[];
  };
  timestamp: number;
  contentHash: string; // For caching
  sources?: string[];
}

/**
 * The real structure returned from background to popup is:
 * { success: boolean, data?: AnalysisResult, error?: any }
 */
export interface AnalysisResponse {
  success: boolean;
  data?: AnalysisResult;
  error?: any;
}

export interface ExtractedContent {
  title: string;
  content: string;
  url: string;
  extractionMethod: "readability" | "selection";
  contentType: "article" | "social-media" | "selection";
  wordCount: number;
  timestamp: Date;
  last_edited: string;
}

export interface IconState {
  type:
    | "default"
    | "analyzing"
    | "high-credibility"
    | "low-credibility"
    | "opinion"
    | "error";
  badgeText?: string;
  badgeColor?: string;
}

export interface AnalysisRequest {
  content: string;
  url: string;
  contentType: "article" | "social-media" | "selection";
}

export interface PopupState {
  currentUrl: string;
  analysisStatus: "idle" | "extracting" | "analyzing" | "complete" | "error";
  analysisResult: AnalysisResult | null;
  errorMessage: string | null;
}
