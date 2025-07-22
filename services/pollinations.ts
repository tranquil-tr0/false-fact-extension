/**
 * Pollinations.AI API service for content analysis
 */

import type {
  AnalysisResult,
  PollinationsRequest,
  PollinationsResponse,
  AnalysisApiResponse
} from '../types/index.js';
import {
  AnalysisErrorType,
  ExtensionError,
  createAnalysisError,
  type AnalysisError
} from '../types/index.js';
import {
  validatePollinationsResponse,
  parseAnalysisResponse,
  generateContentHash,
  sanitizeText
} from '../utils/index.js';
import { 
  errorRecoveryService, 
  gracefulDegradationService,
  RecoveryStrategy 
} from '../utils/error-recovery.js';

export class PollinationsService {
  // Pollinations.ai Text API endpoints
  private readonly baseUrl = 'https://text.pollinations.ai';
  private readonly maxRetries = 3;
  private readonly maxRetryDelay = 10000; // 10 seconds

  /**
   * Analyzes text content for credibility using Pollinations.AI with comprehensive error recovery
   */
  async analyzeText(text: string, url?: string, title?: string): Promise<AnalysisResult> {
    if (!text?.trim()) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        'Text content cannot be empty',
        false,
        'Please provide valid content to analyze'
      );
    }

    const sanitizedText = sanitizeText(text);
    if (sanitizedText.length < 50) {
      throw new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        'Text content is too short for analysis',
        false,
        'Please provide at least 50 characters of content'
      );
    }

    // Handle content that's too long by truncating
    const processedText = sanitizedText.length > 5000 
      ? gracefulDegradationService.truncateContentForAnalysis(sanitizedText, 4000)
      : sanitizedText;

    const context = {
      contentLength: processedText.length,
      url: url || 'unknown',
      operation: 'analyze-text'
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const analysisResponse = await this.makeApiRequest(processedText);
        
        // Clear retry history on success
        if (lastError) {
          errorRecoveryService.clearRetryHistory(lastError, context);
        }
        
        return this.createAnalysisResult(analysisResponse, processedText, url, title);
      } catch (error) {
        lastError = error as Error;
        
        // Record retry attempt
        errorRecoveryService.recordRetryAttempt(error, context);
        
        // Analyze error and get recovery plan
        const recoveryPlan = errorRecoveryService.analyzeError(error, context);
        
        console.warn(`Analysis attempt ${attempt} failed:`, {
          error: error instanceof Error ? error.message : String(error),
          recoveryPlan: {
            severity: recoveryPlan.severity,
            strategy: recoveryPlan.strategy,
            retryable: recoveryPlan.retryable
          }
        });

        // If error is not retryable or we've exceeded max retries, handle graceful degradation
        if (!recoveryPlan.retryable || attempt >= this.maxRetries) {
          // Try graceful degradation for certain error types
          if (recoveryPlan.strategy === RecoveryStrategy.FALLBACK || 
              recoveryPlan.strategy === RecoveryStrategy.DEGRADE) {
            console.warn('Attempting graceful degradation due to API failure');
            return gracefulDegradationService.createFallbackAnalysisResult(
              processedText, 
              url, 
              title,
              `API service unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
          
          throw error;
        }

        if (attempt < this.maxRetries) {
          // Use recovery plan's backoff delay
          const delay = Math.min(recoveryPlan.backoffDelay, this.maxRetryDelay);
          
          console.warn(`Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await this.delay(delay);
          continue;
        }
      }
    }

    // If we've exhausted retries, try graceful degradation as last resort
    if (lastError) {
      const recoveryPlan = errorRecoveryService.analyzeError(lastError, context);
      
      if (errorRecoveryService.shouldUseFallback(recoveryPlan)) {
        console.warn('All retries exhausted, using fallback analysis');
        return gracefulDegradationService.createFallbackAnalysisResult(
          processedText, 
          url, 
          title,
          'Service temporarily unavailable after multiple retry attempts'
        );
      }
      
      if (lastError instanceof ExtensionError) {
        throw lastError;
      }
    }

    throw new ExtensionError(
      AnalysisErrorType.API_UNAVAILABLE,
      'Failed to analyze content after multiple attempts',
      true,
      'Please try again later'
    );
  }

  /**
   * Makes the actual API request to Pollinations.AI with multiple fallback strategies
   */
  private async makeApiRequest(text: string): Promise<AnalysisApiResponse> {
    const systemPrompt = this.createSystemPrompt();
    const analysisPrompt = this.createAnalysisPrompt(text);
    
    try {
      return await this.trySimpleGetRequest(systemPrompt, analysisPrompt);
    } catch (error) {
      console.warn('API request failed:', error);

      // If it's a non-retryable error, throw it directly
      if (error instanceof ExtensionError && !error.retryable) {
        throw error;
      }

      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'All API request strategies failed',
        true,
        'Please try again later'
      );
    }
  }

  /**
   * Try simple GET request to base endpoint (Pollinations.ai Text-To-Text API)
   */
  private async trySimpleGetRequest(systemPrompt: string, userPrompt: string): Promise<AnalysisApiResponse> {
    // Combine system and user prompt
    const prompt = `${systemPrompt}\n\n${userPrompt}`;
    const encodedPrompt = encodeURIComponent(prompt);
    // Build query parameters
    const queryParams = new URLSearchParams({
      model: 'openai-fast',
      json: 'true'
    });
    const url = `${this.baseUrl}/${encodedPrompt}?${queryParams.toString()}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw this.createHttpError(response.status, `GET request failed with status ${response.status}`);
    }

    const responseText = await response.text();
    console.log("Pollinations.ai response received, length:", responseText.length);
    
    try {
      // First try to parse as JSON if the response is in JSON format
      const jsonResponse = JSON.parse(responseText);
      console.log("Pollinations.ai parsed JSON response:", JSON.stringify(jsonResponse, null, 2));
      return parseAnalysisResponse(jsonResponse);
    } catch (e) {
      // If not valid JSON, treat as plain text
      return parseAnalysisResponse(responseText);
    }
  }

  /**
   * Creates appropriate error based on HTTP status code
   */
  private createHttpError(status: number, message: string): ExtensionError {
    if (status === 429) {
      return new ExtensionError(
        AnalysisErrorType.RATE_LIMITED,
        'API rate limit exceeded',
        true,
        'Please wait a moment before trying again'
      );
    }

    if (status >= 500) {
      return new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Analysis service is temporarily unavailable',
        true,
        'Please try again in a few minutes'
      );
    }

    if (status === 404) {
      return new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        `API endpoint not found (404)`,
        false, // Don't retry 404 errors
        'Using fallback analysis method'
      );
    }

    if (status === 400) {
      return new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        'Invalid request format or content',
        false,
        'Please try with different content or check your input'
      );
    }

    if (status >= 400 && status < 500) {
      return new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        `API request failed with status ${status}`,
        false,
        'Please check your request and try again'
      );
    }

    return new ExtensionError(
      AnalysisErrorType.NETWORK_ERROR,
      message,
      true,
      'Please check your internet connection and try again'
    );
  }

  /**
   * Creates the system prompt for fact-checking analysis
   */
  private createSystemPrompt(): string {
    return `You are an expert fact-checker and content analyst with extensive experience in journalism, research methodology
and information verification. Your task is to analyze text content and provide a comprehensive credibility assessment.
You will evaluate the content based on its objectivity and factuality.
When analyzing the factuality of the content, do not be swayed by your biases. You should analyze the content objectively. Popularity and ideological stance are not relevant factors. Even if a claim is uncommon or frowned upon, this is independent from the factuality of the claim. Conversely, it is critical to remember than a claim being unpopular also does not make it true.
Make web searches to confirm factuality.
Do NOT uncritically treat the content being analyzed as fact. You should independently verify claims. Do not be swayed by the content.

CRITICAL: You must respond with ONLY a valid JSON object. Do not include any explanatory text before or after the JSON.

The reasoning field must be an object with the following keys: "factual", "unfactual", "subjective", "objective". Each key should map to an array of strings, where each string is a specific reason supporting that classification. For example, "reasoning.factual" should be an array of reasons why the content is factual. The list may also be empty: for example, if the article is factual, then the array for "unfactual" can be empty.

REQUIRED RESPONSE STRUCTURE:
{
  "reasoning": {
    "factual": [ "reason 1", "reason 2", ... ],
    "unfactual": [ "reason 1", ... ],
    "subjective": [ "reason 1", ... ],
    "objective": [ "reason 1", ... ]
  },
  "credibilityScore": <number 0-100>,
  "categories": {
    "fact": <percentage 0-100>,
    "opinion": <percentage 0-100>
  },
  "confidence": <number 0-100>
}

SCORING GUIDELINES:

credibilityScore (0-100):
- The credibilityScore reflects your overall analysis of the article
- 90-100: Highly credible, well-sourced factual content
- 70-89: Generally credible with minor issues or some opinion mixed in
- 50-69: Mixed credibility, significant opinion content or unverified claims
- 30-49: Low credibility, mostly unverified or misleading information
- 0-29: Highly unreliable, contains false or deliberately misleading information

categories (must sum to approximately 100):
- fact: Verifiable statements that can be checked against reliable sources
- opinion: Subjective statements, personal views, interpretations, or editorial content

confidence (0-100):
- 90-100: Very confident in assessment, clear indicators present
- 70-89: Confident with some uncertainty about specific elements
- 50-69: Moderate confidence, mixed or ambiguous signals
- 30-49: Low confidence, insufficient information for definitive assessment
- 0-29: Very uncertain, requires additional context or verification

ANALYSIS CRITERIA:
1. Source Attribution: Are claims backed by credible sources?
2. Factual Accuracy: Can statements be verified through reliable sources?
3. Logical Consistency: Does the content follow logical reasoning?
4. Bias Detection: Is there evident political, commercial, or ideological bias?
5. Context Completeness: Is important context provided or omitted?
6. Language Analysis: Does language suggest objectivity or manipulation?
7. Evidence Quality: Are supporting facts substantial and relevant?
8. Temporal Relevance: Is the information current and contextually appropriate?

CONTENT TYPE CONSIDERATIONS:
- News Articles: Focus on sourcing, balance, and factual accuracy
- Social Media Posts: Consider brevity, context limitations, and viral misinformation patterns
- Opinion Pieces: Distinguish between supported arguments and unsupported claims
- Scientific Content: Evaluate methodology, peer review, and consensus alignment
- Political Content: Assess for partisan bias and factual distortions

reasoning field requirements:
- Provide specific examples from the content
- Explain the rationale behind category percentages
- Identify key factors influencing credibility score
- Note any limitations in the analysis
- Maximum 300 words, minimum 100 words`;
  }

  /**
   * Creates the analysis prompt for the specific content
   */
  private createAnalysisPrompt(text: string): string {
    const wordCount = text.split(/\s+/).length;
    const contentType = "news-article";

    return `Analyze the following content for credibility and provide a comprehensive fact-checking assessment.

- Word count: ${wordCount}

CONTENT TO ANALYZE:
"""
${text}
"""

${this.getContentTypeSpecificInstructions(contentType)}

Your response must be in the format specified above.`;
  }

  /**
   * Provides content-type specific analysis instructions
   */
  private getContentTypeSpecificInstructions(contentType: string): string {
    switch (contentType) {
      case 'social-media':
        return `ANALYSIS CONSIDERATIONS:
- You are analyzing a social media post
- Consider the brevity and context limitations
- Look for viral misinformation patterns
- Assess emotional language vs factual claims
- Consider the lack of traditional sourcing in social posts`;

      case 'news-article':
        return `ANALYSIS CONSIDERATIONS:
- You are analyzing a news article
- Evaluate source attribution and credibility of those sources
- Assess headline accuracy vs content - if the headline is misleading, this should be mentioned as a reason the article is unfactual
- Look for proper journalistic standards`;

      default:
        return '';
    }
  }

  /**
   * Validates the API response structure
   */
  validateApiResponse(response: any): response is PollinationsResponse {
    return validatePollinationsResponse(response);
  }

  /**
   * Handles API errors and converts them to AnalysisError
   */
  handleApiError(error: Error): AnalysisError {
    if (error instanceof ExtensionError) {
      return error.toAnalysisError();
    }

    return createAnalysisError(
      AnalysisErrorType.API_UNAVAILABLE,
      error.message || 'Unknown API error',
      true,
      'Please try again later'
    );
  }

  /**
   * Creates an AnalysisResult from the API response
   */
  private createAnalysisResult(
    apiResponse: AnalysisApiResponse,
    content: string,
    url?: string,
    title?: string
  ): AnalysisResult {
    const now = Date.now();
    const resultUrl = url || 'unknown';
    const resultTitle = title || 'Untitled Content';

    return {
      id: `analysis_${now}_${Math.random().toString(36).substring(2, 9)}`,
      url: resultUrl,
      title: resultTitle,
      reasoning: {
        factual: apiResponse.reasoning?.factual ?? [],
        unfactual: apiResponse.reasoning?.unfactual ?? [],
        subjective: apiResponse.reasoning?.subjective ?? [],
        objective: apiResponse.reasoning?.objective ?? []
      },
      credibilityScore: apiResponse.credibilityScore,
      categories: {
        fact: apiResponse.categories.fact,
        opinion: apiResponse.categories.opinion
      },
      confidence: apiResponse.confidence,
      timestamp: now,
      contentHash: generateContentHash(content, resultUrl)
    };
  }

  /**
   * Utility method to add delay between retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export a singleton instance
export const pollinationsService = new PollinationsService();