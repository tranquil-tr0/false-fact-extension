/**
 * Validation utilities for API responses and data structures
 */

import type { AnalysisResult, AnalysisRequest } from '../types/models.js';
import type { PollinationsResponse, AnalysisApiResponse } from '../types/api.js';
import { AnalysisErrorType, ExtensionError } from '../types/errors.js';

/**
 * Validates an AnalysisResult object
 */
export function validateAnalysisResult(result: any): result is AnalysisResult {
  if (!result || typeof result !== 'object') return false;

  const requiredFields = ['id', 'url', 'title', 'credibilityScore', 'categories', 'confidence', 'reasoning', 'timestamp', 'contentHash'];
  
  for (const field of requiredFields) {
    if (!(field in result)) return false;
  }

  // Validate score ranges
  if (typeof result.credibilityScore !== 'number' || result.credibilityScore < 0 || result.credibilityScore > 100) {
    return false;
  }

  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 100) {
    return false;
  }

  // Validate categories
  if (!result.categories || typeof result.categories !== 'object') return false;
  
  const { fact, opinion, false: falseValue } = result.categories;
  if (typeof fact !== 'number' || typeof opinion !== 'number' || typeof falseValue !== 'number') {
    return false;
  }

  if (fact < 0 || fact > 100 || opinion < 0 || opinion > 100 || falseValue < 0 || falseValue > 100) {
    return false;
  }

  // Categories should roughly sum to 100 (allow some tolerance for rounding)
  const sum = fact + opinion + falseValue;
  if (Math.abs(sum - 100) > 5) {
    return false;
  }

  return true;
}

/**
 * Validates an AnalysisRequest object
 */
export function validateAnalysisRequest(request: any): request is AnalysisRequest {
  if (!request || typeof request !== 'object') return false;

  return (
    typeof request.content === 'string' &&
    request.content.trim().length > 0 &&
    typeof request.url === 'string' &&
    request.url.trim().length > 0 &&
    typeof request.contentType === 'string' &&
    ['article', 'social-media'].includes(request.contentType)
  );
}

/**
 * Validates Pollinations API response structure
 */
export function validatePollinationsResponse(response: any): response is PollinationsResponse {
  if (!response || typeof response !== 'object') return false;

  if (!Array.isArray(response.choices) || response.choices.length === 0) {
    return false;
  }

  const firstChoice = response.choices[0];
  return !!(
    firstChoice &&
    typeof firstChoice === 'object' &&
    firstChoice.message &&
    typeof firstChoice.message === 'object' &&
    typeof firstChoice.message.content === 'string'
  );
}

/**
 * Parses and validates analysis response from AI
 */
export function parseAnalysisResponse(content: string): AnalysisApiResponse {
  // Clean up the content - sometimes AI responses have extra text before/after JSON
  let cleanContent = content.trim();
  
  // Try to extract JSON from the response if it's wrapped in other text
  const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleanContent = jsonMatch[0];
  }

  try {
    const parsed = JSON.parse(cleanContent);
    
    if (!parsed || typeof parsed !== 'object') {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Invalid response format from analysis service',
        true,
        'Try analyzing the content again'
      );
    }

    // Validate required fields
    const requiredFields = ['credibilityScore', 'categories', 'confidence', 'reasoning'];
    for (const field of requiredFields) {
      if (!(field in parsed)) {
        throw new ExtensionError(
          AnalysisErrorType.API_UNAVAILABLE,
          `Missing required field: ${field}`,
          true,
          'Try analyzing the content again'
        );
      }
    }

    // Validate score ranges
    if (typeof parsed.credibilityScore !== 'number' || parsed.credibilityScore < 0 || parsed.credibilityScore > 100) {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Invalid credibility score in response',
        true,
        'Try analyzing the content again'
      );
    }

    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Invalid confidence score in response',
        true,
        'Try analyzing the content again'
      );
    }

    // Validate categories
    if (!parsed.categories || typeof parsed.categories !== 'object') {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Invalid categories in response',
        true,
        'Try analyzing the content again'
      );
    }

    const { fact, opinion } = parsed.categories;
    if (typeof fact !== 'number' || typeof opinion !== 'number') {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Invalid category values in response',
        true,
        'Try analyzing the content again'
      );
    }

    if (fact < 0 || fact > 100 || opinion < 0 || opinion > 100) {
      throw new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Category values out of range',
        true,
        'Try analyzing the content again'
      );
    }

    return parsed as AnalysisApiResponse;
  } catch (error) {
    if (error instanceof ExtensionError) {
      throw error;
    }
    
    throw new ExtensionError(
      AnalysisErrorType.API_UNAVAILABLE,
      'Failed to parse analysis response',
      true,
      'Try analyzing the content again'
    );
  }
}

/**
 * Validates icon state configuration
 */
export function validateIconState(state: any): boolean {
  if (!state || typeof state !== 'object') return false;

  const validTypes = ['default', 'analyzing', 'high-credibility', 'low-credibility', 'opinion', 'error'];
  
  return (
    typeof state.type === 'string' &&
    validTypes.includes(state.type) &&
    (state.badgeText === undefined || typeof state.badgeText === 'string') &&
    (state.badgeColor === undefined || typeof state.badgeColor === 'string')
  );
}