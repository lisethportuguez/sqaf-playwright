/**
 * SQAF — Error Handling layer entry point (Stage 5). See ADR-0006 and ADR-0008.
 *
 * Hierarchy:
 *
 *   Error
 *   ├── ConfigurationError        config/environment.ts (Stage 1; fails before any test runs)
 *   └── SqafError                 base with classification, category, context and evidence
 *       ├── InfrastructureError   infrastructure/{anti-bot-challenge, network, sut-unavailable}
 *       ├── DataValidationError   test-data/invalid
 *       └── ApiError              api/request-failed
 *
 * automation/locator-timeout and assertion/mismatch are raised by Playwright
 * itself (TimeoutError, failed `expect`); SQAF classifies them after the run
 * instead of wrapping them, so Playwright's call log and diff stay intact.
 *
 * ConfigurationError stays in `config/` because `config` is transversal and
 * must not import any layer; it is re-exported here so every SQAF error has
 * one import point.
 */
export { ConfigurationError } from '../../config/environment';
export { assertNoAntiBotChallenge } from './anti-bot-guard';
export { ApiError, type ApiErrorDetails } from './api-error';
export * from './classifications';
export { DataValidationError, type DataValidationErrorDetails } from './data-validation-error';
export {
  classifyFailure,
  emptyClassificationCounts,
  pageSnapshotSection,
  type FailureClassificationResult,
  type FailureText,
} from './failure-classification';
export {
  InfrastructureError,
  type InfrastructureClassification,
  type InfrastructureErrorDetails,
} from './infrastructure-error';
export {
  formatSqafMessage,
  isSqafError,
  REDACTED,
  sanitizeCause,
  sanitizeContext,
  SqafError,
  type ContextPrimitive,
  type ContextValue,
  type ErrorContext,
  type SqafErrorDetails,
} from './sqaf-error';
