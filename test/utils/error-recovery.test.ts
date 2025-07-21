/**
 * Tests for error recovery and graceful degradation utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ErrorRecoveryService,
  GracefulDegradationService,
  ErrorSeverity,
  RecoveryStrategy,
  type ErrorRecoveryPlan
} from '../../utils/error-recovery.js';
import {
  ExtensionError,
  AnalysisErrorType
} from '../../types/index.js';

describe('ErrorRecoveryService', () => {
  let errorRecoveryService: ErrorRecoveryService;

  beforeEach(() => {
    errorRecoveryService = new ErrorRecoveryService();
  });

  describe('analyzeError', () => {
    it('should analyze network errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.NETWORK_ERROR,
        'Network connection failed',
        true,
        'Check your connection'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.RETRY);
      expect(plan.retryable).toBe(true);
      expect(plan.maxRetries).toBe(3);
      expect(plan.userMessage).toBe('Network connection issue detected');
      expect(plan.fallbackOptions).toContain('Check network settings');
    });

    it('should analyze rate limit errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.RATE_LIMITED,
        'Too many requests',
        true,
        'Wait before retrying'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.RETRY);
      expect(plan.retryable).toBe(true);
      expect(plan.maxRetries).toBe(2);
      expect(plan.userMessage).toBe('API rate limit reached');
      expect(plan.backoffDelay).toBeGreaterThan(0);
    });

    it('should analyze API unavailable errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.API_UNAVAILABLE,
        'Service unavailable',
        true,
        'Try again later'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(plan.retryable).toBe(true);
      expect(plan.maxRetries).toBe(2);
      expect(plan.fallbackOptions).toContain('Try different API endpoint');
    });

    it('should analyze invalid content errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.INVALID_CONTENT,
        'Content is invalid',
        false,
        'Try different content'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.LOW);
      expect(plan.strategy).toBe(RecoveryStrategy.USER_ACTION);
      expect(plan.retryable).toBe(false);
      expect(plan.maxRetries).toBe(0);
      expect(plan.fallbackOptions).toContain('Select different text');
    });

    it('should analyze extraction failed errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.EXTRACTION_FAILED,
        'Could not extract content',
        true,
        'Try manual selection'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(plan.retryable).toBe(true);
      expect(plan.maxRetries).toBe(1);
      expect(plan.suggestedAction).toBe('Trying manual text selection...');
    });

    it('should analyze content too long errors correctly', () => {
      const error = new ExtensionError(
        AnalysisErrorType.CONTENT_TOO_LONG,
        'Content exceeds limit',
        true,
        'Try shorter content'
      );

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.LOW);
      expect(plan.strategy).toBe(RecoveryStrategy.DEGRADE);
      expect(plan.retryable).toBe(true);
      expect(plan.maxRetries).toBe(1);
      expect(plan.suggestedAction).toBe('Analyzing first portion of content...');
    });

    it('should handle TypeError instances', () => {
      const error = new TypeError('fetch is not defined');

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.HIGH);
      expect(plan.strategy).toBe(RecoveryStrategy.RETRY);
      expect(plan.userMessage).toBe('Network connection failed');
      expect(plan.debugInfo?.errorType).toBe('TypeError');
    });

    it('should handle generic Error instances', () => {
      const error = new Error('Operation timed out');

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.RETRY);
      expect(plan.userMessage).toBe('Operation timed out');
      expect(plan.debugInfo?.timeoutError).toBe(true);
    });

    it('should handle JSON parse errors', () => {
      const error = new Error('Unexpected token in JSON at position 0');

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.MEDIUM);
      expect(plan.strategy).toBe(RecoveryStrategy.FALLBACK);
      expect(plan.userMessage).toBe('Response format error');
      expect(plan.debugInfo?.parseError).toBe(true);
    });

    it('should escalate severity after multiple retries', () => {
      const error = new ExtensionError(
        AnalysisErrorType.NETWORK_ERROR,
        'Network failed',
        true,
        'Check connection'
      );

      // Simulate multiple retry attempts
      errorRecoveryService.recordRetryAttempt(error);
      errorRecoveryService.recordRetryAttempt(error);
      errorRecoveryService.recordRetryAttempt(error);

      const plan = errorRecoveryService.analyzeError(error);

      expect(plan.severity).toBe(ErrorSeverity.HIGH);
      expect(plan.strategy).toBe(RecoveryStrategy.USER_ACTION);
      expect(plan.retryable).toBe(false);
    });
  });

  describe('retry tracking', () => {
    it('should track retry attempts correctly', () => {
      const error = new Error('Test error');
      const context = { url: 'https://example.com' };

      expect(errorRecoveryService.getRetryCount(error, context)).toBe(0);

      errorRecoveryService.recordRetryAttempt(error, context);
      expect(errorRecoveryService.getRetryCount(error, context)).toBe(1);

      errorRecoveryService.recordRetryAttempt(error, context);
      expect(errorRecoveryService.getRetryCount(error, context)).toBe(2);
    });

    it('should clear retry history', () => {
      const error = new Error('Test error');
      const context = { url: 'https://example.com' };

      errorRecoveryService.recordRetryAttempt(error, context);
      errorRecoveryService.recordRetryAttempt(error, context);
      expect(errorRecoveryService.getRetryCount(error, context)).toBe(2);

      errorRecoveryService.clearRetryHistory(error, context);
      expect(errorRecoveryService.getRetryCount(error, context)).toBe(0);
    });

    it('should generate unique keys for different errors', () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      const context = { url: 'https://example.com' };

      errorRecoveryService.recordRetryAttempt(error1, context);
      errorRecoveryService.recordRetryAttempt(error2, context);

      expect(errorRecoveryService.getRetryCount(error1, context)).toBe(1);
      expect(errorRecoveryService.getRetryCount(error2, context)).toBe(1);
    });
  });

  describe('utility methods', () => {
    it('should create user-friendly messages', () => {
      const plan: ErrorRecoveryPlan = {
        severity: ErrorSeverity.MEDIUM,
        strategy: RecoveryStrategy.RETRY,
        retryable: true,
        maxRetries: 3,
        backoffDelay: 1000,
        userMessage: 'Network error occurred',
        suggestedAction: 'Retrying...',
        fallbackOptions: ['Check connection', 'Try again later']
      };

      const message = errorRecoveryService.createUserFriendlyMessage(plan);
      expect(message).toBe('Network error occurred Retrying...');
    });

    it('should determine fallback usage correctly', () => {
      const fallbackPlan: ErrorRecoveryPlan = {
        severity: ErrorSeverity.MEDIUM,
        strategy: RecoveryStrategy.FALLBACK,
        retryable: true,
        maxRetries: 1,
        backoffDelay: 1000,
        userMessage: 'Test',
        suggestedAction: 'Test'
      };

      const retryPlan: ErrorRecoveryPlan = {
        severity: ErrorSeverity.MEDIUM,
        strategy: RecoveryStrategy.RETRY,
        retryable: false,
        maxRetries: 0,
        backoffDelay: 1000,
        userMessage: 'Test',
        suggestedAction: 'Test'
      };

      expect(errorRecoveryService.shouldUseFallback(fallbackPlan)).toBe(true);
      expect(errorRecoveryService.shouldUseFallback(retryPlan)).toBe(true);
    });

    it('should determine degradation correctly', () => {
      const degradePlan: ErrorRecoveryPlan = {
        severity: ErrorSeverity.LOW,
        strategy: RecoveryStrategy.DEGRADE,
        retryable: true,
        maxRetries: 1,
        backoffDelay: 0,
        userMessage: 'Test',
        suggestedAction: 'Test'
      };

      const lowSeverityPlan: ErrorRecoveryPlan = {
        severity: ErrorSeverity.LOW,
        strategy: RecoveryStrategy.RETRY,
        retryable: true,
        maxRetries: 1,
        backoffDelay: 1000,
        userMessage: 'Test',
        suggestedAction: 'Test'
      };

      expect(errorRecoveryService.shouldDegrade(degradePlan)).toBe(true);
      expect(errorRecoveryService.shouldDegrade(lowSeverityPlan)).toBe(true);
    });
  });
});

describe('GracefulDegradationService', () => {
  let gracefulDegradationService: GracefulDegradationService;

  beforeEach(() => {
    gracefulDegradationService = new GracefulDegradationService();
  });

  describe('createFallbackAnalysisResult', () => {
    it('should create fallback analysis for normal content', () => {
      const content = 'This is a test article with some factual information and sources.';
      const url = 'https://example.com/article';
      const title = 'Test Article';

      const result = gracefulDegradationService.createFallbackAnalysisResult(
        content, url, title, 'API unavailable'
      );

      expect(result.url).toBe(url);
      expect(result.title).toBe(title);
      expect(result.credibilityScore).toBe(0); // Error state has 0 credibility
      expect(result.confidence).toBe(0); // No confidence for error state
      expect(result.reasoning.factual[0]).toContain('Unable to contact analysis engine');
      expect(result.reasoning.factual[0]).toContain('API unavailable');
      expect(result.categories.fact).toBe(0);
      expect(result.categories.opinion).toBe(0);
      expect(result.categories.false).toBe(0);
    });

    it('should include error message in all reasoning categories', () => {
      const content = 'Test content';
      const result = gracefulDegradationService.createFallbackAnalysisResult(content);
      
      const errorMessage = result.reasoning.factual[0];
      
      // All categories should have the same error message
      expect(result.reasoning.factual[0]).toBe(errorMessage);
      expect(result.reasoning.unfactual[0]).toBe(errorMessage);
      expect(result.reasoning.subjective[0]).toBe(errorMessage);
      expect(result.reasoning.objective[0]).toBe(errorMessage);
    });

    it('should format 404 errors appropriately', () => {
      const content = 'Test content';
      const result = gracefulDegradationService.createFallbackAnalysisResult(
        content, 'https://example.com', 'Test', '404 Not Found'
      );
      
      expect(result.reasoning.factual[0]).toContain('API endpoint not found (404)');
    });

    it('should format 500 errors appropriately', () => {
      const content = 'Test content';
      const result = gracefulDegradationService.createFallbackAnalysisResult(
        content, 'https://example.com', 'Test', '500 Server Error'
      );
      
      expect(result.reasoning.factual[0]).toContain('API server error (500)');
    });

    it('should handle missing URL and title gracefully', () => {
      const content = 'Test content without URL or title.';
      
      const result = gracefulDegradationService.createFallbackAnalysisResult(content);
      
      expect(result.url).toBe('unknown');
      expect(result.title).toBe('Untitled Content');
      expect(result.id).toContain('error_');
    });

    it('should generate unique IDs for each result', () => {
      const content = 'Test content';
      
      const result1 = gracefulDegradationService.createFallbackAnalysisResult(content);
      const result2 = gracefulDegradationService.createFallbackAnalysisResult(content);
      
      expect(result1.id).not.toBe(result2.id);
    });
  });

  describe('truncateContentForAnalysis', () => {
    it('should not truncate content shorter than max length', () => {
      const content = 'Short content that fits within limits.';
      
      const result = gracefulDegradationService.truncateContentForAnalysis(content, 1000);
      
      expect(result).toBe(content);
    });

    it('should truncate at sentence boundaries when possible', () => {
      const content = 'First sentence. Second sentence. Third sentence that will be cut off.';
      
      const result = gracefulDegradationService.truncateContentForAnalysis(content, 35);
      
      expect(result).toBe('First sentence. Second sentence.');
      expect(result.endsWith('.')).toBe(true);
    });

    it('should truncate at word boundaries as fallback', () => {
      const content = 'This is a very long sentence without proper punctuation that needs to be truncated';
      
      const result = gracefulDegradationService.truncateContentForAnalysis(content, 50);
      
      expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
      expect(result.endsWith('...')).toBe(true);
      expect(result.includes(' ')).toBe(true); // Should break at word boundary
    });

    it('should handle content with mixed punctuation', () => {
      const content = 'Question? Answer! Statement. Another question? Final statement.';
      
      const result = gracefulDegradationService.truncateContentForAnalysis(content, 30);
      
      expect(result).toMatch(/[.!?]$/); // Should end with punctuation
    });

    it('should use default max length when not specified', () => {
      const longContent = 'a'.repeat(3000);
      
      const result = gracefulDegradationService.truncateContentForAnalysis(longContent);
      
      expect(result.length).toBeLessThanOrEqual(2003); // 2000 + '...'
    });
  });

  describe('generateSimpleHash', () => {
    it('should generate consistent hashes for same input', () => {
      const input = 'test content for hashing';
      
      const hash1 = (gracefulDegradationService as any).generateSimpleHash(input);
      const hash2 = (gracefulDegradationService as any).generateSimpleHash(input);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for different inputs', () => {
      const input1 = 'first test content';
      const input2 = 'second test content';
      
      const hash1 = (gracefulDegradationService as any).generateSimpleHash(input1);
      const hash2 = (gracefulDegradationService as any).generateSimpleHash(input2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty strings', () => {
      const hash = (gracefulDegradationService as any).generateSimpleHash('');
      
      expect(typeof hash).toBe('string');
      expect(hash).toBe('0');
    });
  });
});