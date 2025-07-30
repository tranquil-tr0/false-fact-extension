/**
 * Content validation and sanitization utilities
 */

import type { ExtractedContent } from "../types/models.js";
import { AnalysisErrorType, ExtensionError } from "../types/errors.js";
import murmurhash from "murmurhash";

// Content validation constants
export const CONTENT_LIMITS = {
  MIN_WORD_COUNT: 10,
  MAX_WORD_COUNT: 10000,
  MAX_TITLE_LENGTH: 500,
  MIN_CONTENT_LENGTH: 50,
  MAX_CONTENT_LENGTH: 50000,
} as const;

/**
 * Validates extracted content meets minimum requirements
 */
export function validateContent(content: ExtractedContent): void {
  if (!content.content?.trim()) {
    throw new ExtensionError(
      AnalysisErrorType.INVALID_CONTENT,
      "Content cannot be empty",
      false,
      "Try selecting text manually or navigate to a different page"
    );
  }

  if (content.content.length < CONTENT_LIMITS.MIN_CONTENT_LENGTH) {
    throw new ExtensionError(
      AnalysisErrorType.INVALID_CONTENT,
      `Content too short (minimum ${CONTENT_LIMITS.MIN_CONTENT_LENGTH} characters)`,
      false,
      "Try selecting more text or navigate to a longer article"
    );
  }

  if (content.content.length > CONTENT_LIMITS.MAX_CONTENT_LENGTH) {
    throw new ExtensionError(
      AnalysisErrorType.CONTENT_TOO_LONG,
      `Content too long (maximum ${CONTENT_LIMITS.MAX_CONTENT_LENGTH} characters)`,
      false,
      "Try selecting a shorter portion of text"
    );
  }

  if (content.wordCount < CONTENT_LIMITS.MIN_WORD_COUNT) {
    throw new ExtensionError(
      AnalysisErrorType.INVALID_CONTENT,
      `Content too short (minimum ${CONTENT_LIMITS.MIN_WORD_COUNT} words)`,
      false,
      "Try selecting more text for analysis"
    );
  }

  if (content.wordCount > CONTENT_LIMITS.MAX_WORD_COUNT) {
    throw new ExtensionError(
      AnalysisErrorType.CONTENT_TOO_LONG,
      `Content too long (maximum ${CONTENT_LIMITS.MAX_WORD_COUNT} words)`,
      false,
      "Try selecting a shorter portion of text"
    );
  }
}

/**
 * Sanitizes text content by removing potentially harmful or unnecessary elements
 */
export function sanitizeText(text: string): string {
  if (!text) return "";

  return (
    text
      // Remove HTML tags
      .replace(/<[^>]*>/g, "")
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
      // Trim whitespace
      .trim()
  );
}

/**
 * Sanitizes title text with additional length constraints
 */
export function sanitizeTitle(title: string): string {
  const sanitized = sanitizeText(title);

  if (sanitized.length > CONTENT_LIMITS.MAX_TITLE_LENGTH) {
    return (
      sanitized.substring(0, CONTENT_LIMITS.MAX_TITLE_LENGTH).trim() + "..."
    );
  }

  return sanitized;
}

/**
 * Counts words in text content
 */
export function countWords(text: string): number {
  if (!text?.trim()) return 0;

  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

/**
 * Generates a hash for content caching
 */
export function generateContentHash(content: string): number {
  return murmurhash.v3(content);
}

/**
 * Validates URL format
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts domain from URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Determines if content appears to be from a social media platform
 */
export function isSocialMediaContent(url: string, content: string): boolean {
  const socialDomains = [
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "tiktok.com",
    "reddit.com",
    "youtube.com",
  ];

  const domain = extractDomain(url).toLowerCase();
  const isSocialDomain = socialDomains.some((social) =>
    domain.includes(social)
  );

  // Also check content characteristics
  const hasHashtags = /#\w+/.test(content);
  const hasMentions = /@\w+/.test(content);
  const isShort = content.length < 1000;

  return isSocialDomain || (isShort && (hasHashtags || hasMentions));
}
