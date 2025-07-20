/**
 * Main utilities export file for the fact-checking extension
 */

// Content utilities
export {
  CONTENT_LIMITS,
  validateContent,
  sanitizeText,
  sanitizeTitle,
  countWords,
  generateContentHash,
  validateUrl,
  extractDomain,
  isSocialMediaContent
} from './content.js';

// Validation utilities
export {
  validateAnalysisResult,
  validateAnalysisRequest,
  validatePollinationsResponse,
  parseAnalysisResponse,
  validateIconState
} from './validation.js';

// Icon generation utilities
export {
  IconGenerator,
  iconGenerator,
  ICON_COLORS,
  ICON_SIZES,
  type IconAnimationData,
  type AnimationStep,
  type IconVisibilityTest
} from './icon-generator.js';

// Error recovery utilities
export {
  ErrorRecoveryService,
  GracefulDegradationService,
  errorRecoveryService,
  gracefulDegradationService,
  ErrorSeverity,
  RecoveryStrategy,
  type ErrorRecoveryPlan
} from './error-recovery.js';