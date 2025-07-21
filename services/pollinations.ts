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
  // OpenAI-compatible endpoint (as per documentation)

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
      model: 'openai',
      json: 'true'
    });
    const url = `${this.baseUrl}/${encodedPrompt}?${queryParams.toString()}`;

    console.log("Attempting Pollinations.ai simple GET request:", url);

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
    return `You are an expert fact-checker and content analyst with extensive experience in journalism, research methodology, and information verification. Your task is to analyze text content and provide a comprehensive credibility assessment.

CRITICAL: You must respond with ONLY a valid JSON object. Do not include any explanatory text before or after the JSON.

You must provide your reasoning first in the JSON object, before any scores or categories.

Required JSON structure:
{
  "reasoning": "<detailed explanation of your analysis>",
  "credibilityScore": <number 0-100>,
  "categories": {
    "fact": <percentage 0-100>,
    "opinion": <percentage 0-100>,
    "false": <percentage 0-100>
  },
  "confidence": <number 0-100>
}

SCORING GUIDELINES:

credibilityScore (0-100):
- 90-100: Highly credible, well-sourced factual content
- 70-89: Generally credible with minor issues or some opinion mixed in
- 50-69: Mixed credibility, significant opinion content or unverified claims
- 30-49: Low credibility, mostly unverified or misleading information
- 0-29: Highly unreliable, contains false or deliberately misleading information

categories (must sum to approximately 100):
- fact: Verifiable statements that can be checked against reliable sources
- opinion: Subjective statements, personal views, interpretations, or editorial content
- false: Demonstrably incorrect information, misleading claims, or unsubstantiated assertions

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
    const contentType = this.detectContentType(text);
    const hasUrls = /https?:\/\/[^\s]+/gi.test(text);
    const hasQuotes = /[""].*?[""]|".*?"/g.test(text);
    const hasNumbers = /\d+(\.\d+)?%?/g.test(text);

    return `Analyze the following content for credibility and provide a comprehensive fact-checking assessment.

CONTENT METADATA:
- Word count: ${wordCount}
- Detected type: ${contentType}
- Contains URLs: ${hasUrls ? 'Yes' : 'No'}
- Contains quotes: ${hasQuotes ? 'Yes' : 'No'}
- Contains statistics: ${hasNumbers ? 'Yes' : 'No'}

CONTENT TO ANALYZE:
"""
${text}
"""

ANALYSIS INSTRUCTIONS:
1. Examine each factual claim for verifiability
2. Identify opinion statements vs factual assertions
3. Look for potential misinformation or misleading information
4. Consider the source context and credibility indicators
5. Assess the overall balance of fact, opinion, and false information
6. Provide confidence level based on available evidence and clarity of assessment

${this.getContentTypeSpecificInstructions(contentType)}

Respond with the JSON analysis following the exact format specified in the system prompt.`;
  }

  /**
   * Detects the likely content type based on text characteristics
   */
  private detectContentType(text: string): string {
    const lowerText = text.toLowerCase();

    // News article indicators (check first for news-specific phrases)
    if (lowerText.includes('according to') || lowerText.includes('reported') ||
      lowerText.includes('sources say') || lowerText.includes('breaking:') ||
      lowerText.includes('sources familiar') || lowerText.includes('world health organization')) {
      return 'news-article';
    }

    // Opinion piece indicators (check before scientific to catch "I believe" statements)
    if (lowerText.includes('i believe') || lowerText.includes('in my opinion') ||
      lowerText.includes('i think') || lowerText.includes('editorial')) {
      return 'opinion-piece';
    }

    // Scientific content indicators (more specific scientific terms)
    if (lowerText.includes('peer-reviewed') || lowerText.includes('methodology') ||
      lowerText.includes('p-value') || lowerText.includes('double-blind') ||
      (lowerText.includes('study') && (lowerText.includes('subjects') || lowerText.includes('examined'))) ||
      (lowerText.includes('clinical trial') && lowerText.includes('participants'))) {
      return 'scientific-content';
    }

    // Social media indicators (check after more specific types)
    if (lowerText.includes('@') || lowerText.includes('#') ||
      (text.length < 280 && (lowerText.includes('just saw') || lowerText.includes('can you believe')))) {
      return 'social-media';
    }

    return 'general-content';
  }

  /**
   * Provides content-type specific analysis instructions
   */
  private getContentTypeSpecificInstructions(contentType: string): string {
    switch (contentType) {
      case 'social-media':
        return `SOCIAL MEDIA ANALYSIS FOCUS:
- Consider the brevity and context limitations
- Look for viral misinformation patterns
- Assess emotional language vs factual claims
- Consider the lack of traditional sourcing in social posts`;

      case 'news-article':
        return `NEWS ARTICLE ANALYSIS FOCUS:
- Evaluate source attribution and credibility
- Check for balanced reporting vs bias
- Assess headline accuracy vs content
- Look for proper journalistic standards`;

      case 'opinion-piece':
        return `OPINION PIECE ANALYSIS FOCUS:
- Distinguish between supported arguments and unsupported claims
- Evaluate the quality of evidence presented
- Assess logical reasoning and consistency
- Consider the difference between opinion and factual assertions`;

      case 'scientific-content':
        return `SCIENTIFIC CONTENT ANALYSIS FOCUS:
- Evaluate methodology and peer review status
- Check alignment with scientific consensus
- Assess data quality and statistical claims
- Look for proper citation and evidence standards`;

      default:
        return `GENERAL CONTENT ANALYSIS FOCUS:
- Apply standard fact-checking principles
- Evaluate claims against available evidence
- Consider context and potential bias
- Assess overall credibility indicators`;
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
      reasoning: apiResponse.reasoning,
      credibilityScore: apiResponse.credibilityScore,
      categories: {
        fact: apiResponse.categories.fact,
        opinion: apiResponse.categories.opinion,
        false: apiResponse.categories.false
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