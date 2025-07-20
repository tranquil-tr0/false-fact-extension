/**
 * Error recovery and graceful degradation utilities
 */

import type { AnalysisResult } from '../types/index.js';
import {
    AnalysisErrorType,
    ExtensionError
} from '../types/index.js';

/**
 * Error classification for recovery strategies
 */
export enum ErrorSeverity {
    LOW = 'low',           // Minor issues, can continue with degraded functionality
    MEDIUM = 'medium',     // Significant issues, requires user intervention
    HIGH = 'high',         // Critical issues, operation cannot continue
    FATAL = 'fatal'        // System-level issues, extension may need restart
}

/**
 * Recovery strategy types
 */
export enum RecoveryStrategy {
    RETRY = 'retry',                    // Retry the operation
    FALLBACK = 'fallback',             // Use alternative approach
    DEGRADE = 'degrade',               // Continue with reduced functionality
    CACHE = 'cache',                   // Use cached data if available
    USER_ACTION = 'user_action',       // Require user intervention
    ABORT = 'abort'                    // Cannot recover, abort operation
}

/**
 * Error recovery recommendation
 */
export interface ErrorRecoveryPlan {
    severity: ErrorSeverity;
    strategy: RecoveryStrategy;
    retryable: boolean;
    maxRetries: number;
    backoffDelay: number;
    userMessage: string;
    suggestedAction: string;
    fallbackOptions?: string[];
    debugInfo?: Record<string, any>;
}

/**
 * Error recovery service for handling different failure scenarios
 */
export class ErrorRecoveryService {
    private readonly retryHistory = new Map<string, number>();
    private readonly maxRetryHistory = 100; // Limit memory usage

    /**
     * Analyzes an error and provides recovery recommendations
     * @param error - The error to analyze
     * @param context - Optional context information about the error environment
     * @returns An error recovery plan with recommendations
     */
    analyzeError(error: unknown, context?: Record<string, any>): ErrorRecoveryPlan {
        // Generate a unique key for this error based on error details and context
        const errorKey = this.generateErrorKey(error, context);

        // Get the number of previous retry attempts for this error
        const retryCount = this.retryHistory.get(errorKey) || 0;

        // Log context information for debugging if available
        if (context && Object.keys(context).length > 0) {
            console.debug('Error context:', context);
        }

        // Analyze different error types with appropriate strategies
        if (error instanceof ExtensionError) {
            return this.analyzeExtensionError(error, retryCount, context);
        }

        if (error instanceof TypeError) {
            return this.analyzeTypeError(error, retryCount, context);
        }

        if (error instanceof Error) {
            return this.analyzeGenericError(error, retryCount, context);
        }

        return this.createFatalErrorPlan('Unknown error type encountered');
    }

    /**
     * Analyzes ExtensionError instances
     */
    private analyzeExtensionError(
        error: ExtensionError,
        retryCount: number,
        context?: Record<string, any>
    ): ErrorRecoveryPlan {
        switch (error.type) {
            case AnalysisErrorType.NETWORK_ERROR:
                return {
                    severity: retryCount < 3 ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
                    strategy: retryCount < 3 ? RecoveryStrategy.RETRY : RecoveryStrategy.USER_ACTION,
                    retryable: retryCount < 3,
                    maxRetries: 3,
                    backoffDelay: Math.min(1000 * Math.pow(2, retryCount), 10000),
                    userMessage: 'Network connection issue detected',
                    suggestedAction: retryCount < 3
                        ? 'Retrying automatically...'
                        : 'Please check your internet connection and try again',
                    fallbackOptions: ['Check network settings', 'Try again later', 'Use cached results'],
                    debugInfo: { retryCount, networkStatus: navigator.onLine }
                };

            case AnalysisErrorType.RATE_LIMITED:
                return {
                    severity: ErrorSeverity.MEDIUM,
                    strategy: RecoveryStrategy.RETRY,
                    retryable: true,
                    maxRetries: 2,
                    backoffDelay: Math.min(5000 * Math.pow(2, retryCount), 30000),
                    userMessage: 'API rate limit reached',
                    suggestedAction: 'Waiting before retry...',
                    fallbackOptions: ['Wait and retry', 'Try with shorter content'],
                    debugInfo: { retryCount, rateLimitHit: true }
                };

            case AnalysisErrorType.API_UNAVAILABLE:
                // Immediately use fallback for 404 errors (not found)
                if (error.message.includes('404') || error.message.toLowerCase().includes('not found')) {
                    return {
                        severity: ErrorSeverity.MEDIUM,
                        strategy: RecoveryStrategy.FALLBACK,
                        retryable: false, // Don't retry 404 errors
                        maxRetries: 0,
                        backoffDelay: 0,
                        userMessage: 'Analysis service endpoint not found',
                        suggestedAction: 'Using fallback analysis method',
                        fallbackOptions: ['Try again later', 'Use cached results', 'Check for extension updates'],
                        debugInfo: { retryCount, serviceStatus: 'not_found', statusCode: 404 }
                    };
                }

                return {
                    severity: retryCount < 2 ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
                    strategy: retryCount < 2 ? RecoveryStrategy.FALLBACK : RecoveryStrategy.USER_ACTION,
                    retryable: retryCount < 2,
                    maxRetries: 2,
                    backoffDelay: Math.min(2000 * Math.pow(2, retryCount), 15000),
                    userMessage: 'Analysis service temporarily unavailable',
                    suggestedAction: retryCount < 2
                        ? 'Trying alternative approach...'
                        : 'Please try again later',
                    fallbackOptions: ['Try different API endpoint', 'Use cached results', 'Try again later'],
                    debugInfo: { retryCount, serviceStatus: 'unavailable' }
                };

            case AnalysisErrorType.INVALID_CONTENT:
                return {
                    severity: ErrorSeverity.LOW,
                    strategy: RecoveryStrategy.USER_ACTION,
                    retryable: false,
                    maxRetries: 0,
                    backoffDelay: 0,
                    userMessage: 'Content cannot be analyzed',
                    suggestedAction: error.suggestedAction || 'Please try with different content',
                    fallbackOptions: ['Select different text', 'Try another page', 'Check content format'],
                    debugInfo: { contentLength: context?.contentLength, contentType: context?.contentType }
                };

            case AnalysisErrorType.EXTRACTION_FAILED:
                return {
                    severity: ErrorSeverity.MEDIUM,
                    strategy: RecoveryStrategy.FALLBACK,
                    retryable: true,
                    maxRetries: 1,
                    backoffDelay: 1000,
                    userMessage: 'Content extraction failed',
                    suggestedAction: 'Trying manual text selection...',
                    fallbackOptions: ['Select text manually', 'Refresh page', 'Try different page'],
                    debugInfo: { retryCount, extractionMethod: context?.extractionMethod }
                };

            case AnalysisErrorType.CONTENT_TOO_LONG:
                return {
                    severity: ErrorSeverity.LOW,
                    strategy: RecoveryStrategy.DEGRADE,
                    retryable: true,
                    maxRetries: 1,
                    backoffDelay: 0,
                    userMessage: 'Content is too long for analysis',
                    suggestedAction: 'Analyzing first portion of content...',
                    fallbackOptions: ['Select shorter text', 'Analyze in parts', 'Summarize content first'],
                    debugInfo: { contentLength: context?.contentLength, maxLength: context?.maxLength }
                };

            default:
                return this.createGenericErrorPlan(error.message, retryCount);
        }
    }

    /**
     * Analyzes TypeError instances (usually network/fetch issues)
     */
    private analyzeTypeError(error: TypeError, retryCount: number, context?: Record<string, any>): ErrorRecoveryPlan {
        if (error.message.includes('fetch') || error.message.includes('network')) {
            return {
                severity: ErrorSeverity.HIGH,
                strategy: RecoveryStrategy.RETRY,
                retryable: retryCount < 2,
                maxRetries: 2,
                backoffDelay: Math.min(2000 * Math.pow(2, retryCount), 8000),
                userMessage: 'Network connection failed',
                suggestedAction: 'Please check your internet connection',
                fallbackOptions: ['Check network settings', 'Try again later', 'Restart browser'],
                debugInfo: { retryCount, errorType: 'TypeError', networkOnline: navigator.onLine }
            };
        }

        return this.createGenericErrorPlan(error.message, retryCount);
    }

    /**
     * Analyzes generic Error instances
     */
    private analyzeGenericError(error: Error, retryCount: number, context?: Record<string, any>): ErrorRecoveryPlan {
        // Check for common error patterns
        if (error.message.toLowerCase().includes('timeout') || error.message.toLowerCase().includes('timed out')) {
            return {
                severity: ErrorSeverity.MEDIUM,
                strategy: RecoveryStrategy.RETRY,
                retryable: retryCount < 2,
                maxRetries: 2,
                backoffDelay: Math.min(3000 * Math.pow(2, retryCount), 12000),
                userMessage: 'Operation timed out',
                suggestedAction: 'Retrying with shorter timeout...',
                fallbackOptions: ['Try with shorter content', 'Check connection speed', 'Try again later'],
                debugInfo: { retryCount, timeoutError: true }
            };
        }

        if (error.message.includes('JSON') || error.message.includes('parse')) {
            return {
                severity: ErrorSeverity.MEDIUM,
                strategy: RecoveryStrategy.FALLBACK,
                retryable: true,
                maxRetries: 1,
                backoffDelay: 1000,
                userMessage: 'Response format error',
                suggestedAction: 'Trying alternative API format...',
                fallbackOptions: ['Try different API endpoint', 'Retry request', 'Report issue'],
                debugInfo: { retryCount, parseError: true, response: context?.response }
            };
        }

        return this.createGenericErrorPlan(error.message, retryCount);
    }

    /**
     * Creates a generic error recovery plan
     */
    private createGenericErrorPlan(message: string, retryCount: number): ErrorRecoveryPlan {
        return {
            severity: retryCount < 2 ? ErrorSeverity.MEDIUM : ErrorSeverity.HIGH,
            strategy: retryCount < 2 ? RecoveryStrategy.RETRY : RecoveryStrategy.USER_ACTION,
            retryable: retryCount < 2,
            maxRetries: 2,
            backoffDelay: Math.min(1500 * Math.pow(2, retryCount), 6000),
            userMessage: 'An unexpected error occurred',
            suggestedAction: retryCount < 2 ? 'Retrying...' : 'Please try again later',
            fallbackOptions: ['Retry operation', 'Refresh page', 'Restart extension'],
            debugInfo: { retryCount, originalMessage: message }
        };
    }

    /**
     * Creates a fatal error recovery plan
     */
    private createFatalErrorPlan(message: string): ErrorRecoveryPlan {
        return {
            severity: ErrorSeverity.FATAL,
            strategy: RecoveryStrategy.ABORT,
            retryable: false,
            maxRetries: 0,
            backoffDelay: 0,
            userMessage: 'Critical system error',
            suggestedAction: 'Please restart the extension or browser',
            fallbackOptions: ['Restart extension', 'Restart browser', 'Report issue'],
            debugInfo: { fatalError: true, message }
        };
    }

    /**
     * Records a retry attempt for an error
     */
    recordRetryAttempt(error: unknown, context?: Record<string, any>): void {
        const errorKey = this.generateErrorKey(error, context);
        const currentCount = this.retryHistory.get(errorKey) || 0;
        this.retryHistory.set(errorKey, currentCount + 1);

        // Clean up old entries to prevent memory leaks
        if (this.retryHistory.size > this.maxRetryHistory) {
            const oldestKey = this.retryHistory.keys().next().value;
            if (oldestKey) {
                this.retryHistory.delete(oldestKey);
            }
        }
    }

    /**
     * Clears retry history for an error (after successful recovery)
     */
    clearRetryHistory(error: unknown, context?: Record<string, any>): void {
        const errorKey = this.generateErrorKey(error, context);
        this.retryHistory.delete(errorKey);
    }

    /**
     * Gets retry count for an error
     */
    getRetryCount(error: unknown, context?: Record<string, any>): number {
        const errorKey = this.generateErrorKey(error, context);
        return this.retryHistory.get(errorKey) || 0;
    }

    /**
     * Generates a unique key for error tracking
     */
    private generateErrorKey(error: unknown, context?: Record<string, any>): string {
        let key = '';

        if (error instanceof ExtensionError) {
            key = `${error.type}:${error.message}`;
        } else if (error instanceof Error) {
            key = `${error.constructor.name}:${error.message}`;
        } else {
            key = `unknown:${String(error)}`;
        }

        // Add context information to make key more specific
        if (context) {
            if (context.url) {
                key += `:${context.url}`;
            }
            if (context.operation) {
                key += `:${context.operation}`;
            }
            // Add additional context properties that might help identify the error
            if (context.contentType) {
                key += `:${context.contentType}`;
            }
            if (context.timestamp) {
                key += `:${context.timestamp}`;
            }
        }

        return key;
    }

    /**
     * Creates a user-friendly error message with recovery suggestions
     */
    createUserFriendlyMessage(plan: ErrorRecoveryPlan): string {
        let message = plan.userMessage;

        if (plan.strategy === RecoveryStrategy.RETRY && plan.retryable) {
            message += ` ${plan.suggestedAction}`;
        } else if (plan.fallbackOptions && plan.fallbackOptions.length > 0) {
            message += ` You can try: ${plan.fallbackOptions.slice(0, 2).join(' or ')}.`;
        }

        return message;
    }

    /**
     * Determines if an error should trigger a fallback mechanism
     * @param plan - The error recovery plan to evaluate
     * @returns True if fallback should be used, false otherwise
     */
    shouldUseFallback(plan: ErrorRecoveryPlan): boolean {
        return plan.strategy === RecoveryStrategy.FALLBACK ||
            (plan.strategy === RecoveryStrategy.RETRY && !plan.retryable);
    }

    /**
     * Determines if graceful degradation should be applied
     * @param plan - The error recovery plan to evaluate
     * @returns True if degradation should be applied, false otherwise
     */
    shouldDegrade(plan: ErrorRecoveryPlan): boolean {
        return plan.strategy === RecoveryStrategy.DEGRADE ||
            plan.severity === ErrorSeverity.LOW;
    }
}

/**
 * Graceful degradation strategies for different scenarios
 */
export class GracefulDegradationService {
    /**
     * Creates a fallback analysis result when API fails
     */
    createFallbackAnalysisResult(
        content: string,
        url?: string,
        title?: string,
        reason?: string
    ): AnalysisResult {
        const now = Date.now();
        const wordCount = content.split(/\s+/).length;

        // Enhanced heuristic-based analysis as fallback
        const hasQuestionableWords = /\b(allegedly|reportedly|claims|unconfirmed|rumor|according to|might|could|may|possibly)\b/gi.test(content);
        const hasStrongLanguage = /\b(definitely|absolutely|certainly|proven|fact|confirmed|undoubtedly|clearly|obviously)\b/gi.test(content);
        const hasUrls = /https?:\/\/[^\s]+/gi.test(content);
        const hasCitations = /\b(\[\d+\]|\(\d{4}\)|\d{4}:)\b/gi.test(content);
        const hasStatistics = /\b\d+(\.\d+)?%|\d+ out of \d+\b/gi.test(content);
        const hasEmotionalLanguage = /\b(shocking|outrageous|unbelievable|amazing|terrible|horrible|incredible|ridiculous)\b/gi.test(content);
        const hasQualifiers = /\b(some|many|most|few|several|often|sometimes|rarely)\b/gi.test(content);

        // Basic credibility scoring based on enhanced heuristics
        let credibilityScore = 50; // Start neutral

        // Source indicators
        if (hasUrls) credibilityScore += 15; // URLs suggest sourcing
        if (hasCitations) credibilityScore += 20; // Citations suggest academic rigor

        // Language indicators
        if (hasStrongLanguage && !hasQuestionableWords) credibilityScore += 15;
        if (hasQuestionableWords) credibilityScore -= 15;
        if (hasEmotionalLanguage) credibilityScore -= 20; // Emotional language often indicates opinion
        if (hasQualifiers && !hasEmotionalLanguage) credibilityScore += 5; // Nuanced language without emotion

        // Evidence indicators
        if (hasStatistics) credibilityScore += 10; // Statistics suggest data-backed claims

        // Word count based scoring with more granularity
        if (wordCount < 5) {
            credibilityScore -= 30; // Extremely short content is very unreliable
        } else if (wordCount < 20) {
            credibilityScore -= 20; // Very short content is less reliable
        } else if (wordCount < 50) {
            credibilityScore -= 10; // Short content is somewhat less reliable
        } else if (wordCount > 500) {
            credibilityScore += 15; // Longer content might be more detailed
        } else if (wordCount > 100) {
            credibilityScore += 5; // Moderately long content is slightly more reliable
        }

        // Ensure score is within bounds
        credibilityScore = Math.max(0, Math.min(100, credibilityScore));

        // Calculate more balanced category distribution
        const factPercentage = Math.max(20, Math.min(80, credibilityScore));
        const opinionPercentage = Math.max(10, Math.min(70, 100 - factPercentage - 10));
        const falsePercentage = Math.max(0, 100 - factPercentage - opinionPercentage);

        // Build detailed reasoning
        let reasoningDetails = [];
        if (hasUrls) reasoningDetails.push('contains URLs (potential sources)');
        if (hasCitations) reasoningDetails.push('contains citations');
        if (hasStatistics) reasoningDetails.push('contains statistical data');
        if (hasQuestionableWords) reasoningDetails.push('contains uncertain language');
        if (hasStrongLanguage) reasoningDetails.push('contains definitive language');
        if (hasEmotionalLanguage) reasoningDetails.push('contains emotional language');
        if (hasQualifiers) reasoningDetails.push('contains qualifying statements');
        reasoningDetails.push(`word count: ${wordCount}`);

        // Format the error reason to be more user-friendly
        let formattedReason = reason || '';
        if (formattedReason.includes('404')) {
            formattedReason = 'API endpoint not found (404)';
        } else if (formattedReason.includes('500')) {
            formattedReason = 'API server error (500)';
        }

        return {
            id: `fallback_${now}_${Math.random().toString(36).substring(2, 11)}`,
            url: url || 'unknown',
            title: title || 'Untitled Content',
            credibilityScore,
            categories: {
                fact: factPercentage,
                opinion: opinionPercentage,
                false: falsePercentage
            },
            confidence: 30, // Low confidence for fallback analysis
            reasoning: `Fallback analysis performed due to service unavailability${formattedReason ? ` - ${formattedReason}` : ''}. This is a basic assessment based on simple content patterns and should not be considered as reliable as full AI analysis. Key indicators: ${reasoningDetails.join(', ')}.`,
            timestamp: now,
            contentHash: this.generateSimpleHash(content + (url || ''))
        };
    }

    /**
     * Creates a simple hash for content identification
     * Uses a basic djb2 algorithm for string hashing
     * @param input - The string to hash
     * @returns A string representation of the hash
     */
    private generateSimpleHash(input: string): string {
        if (!input || input.length === 0) {
            return '0';
        }

        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * Truncates content for analysis when it's too long
     */
    truncateContentForAnalysis(content: string, maxLength: number = 2000): string {
        if (content.length <= maxLength) {
            return content;
        }

        // Try to truncate at sentence boundaries
        const truncated = content.substring(0, maxLength);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentenceEnd > maxLength * 0.7) {
            return truncated.substring(0, lastSentenceEnd + 1);
        }

        // Fallback to word boundary
        const lastSpaceIndex = truncated.lastIndexOf(' ');
        if (lastSpaceIndex > maxLength * 0.8) {
            return truncated.substring(0, lastSpaceIndex) + '...';
        }

        return truncated + '...';
    }
}

// Export singleton instances
export const errorRecoveryService = new ErrorRecoveryService();
export const gracefulDegradationService = new GracefulDegradationService();