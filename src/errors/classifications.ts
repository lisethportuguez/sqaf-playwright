/**
 * SQAF — Failure taxonomy (Stage 5). See ADR-0008.
 *
 * Every classification is `<category>/<reason>`. The category groups causes
 * that are analysed together in Stage 7 (for example, infrastructure failures
 * are reported separately from product or automation failures, ADR-0006).
 *
 * Classifying is INFORMATIONAL: it never changes a test status, the number of
 * retries or the exit code.
 */

export const INFRASTRUCTURE_ANTI_BOT = 'infrastructure/anti-bot-challenge' as const;
export const INFRASTRUCTURE_NETWORK = 'infrastructure/network' as const;
export const INFRASTRUCTURE_SUT_UNAVAILABLE = 'infrastructure/sut-unavailable' as const;
export const TEST_DATA_INVALID = 'test-data/invalid' as const;
export const API_REQUEST_FAILED = 'api/request-failed' as const;
export const AUTOMATION_LOCATOR_TIMEOUT = 'automation/locator-timeout' as const;
export const ASSERTION_MISMATCH = 'assertion/mismatch' as const;
export const UNCLASSIFIED = 'unclassified' as const;

/** Classifications that an SQAF error can carry (raised by the framework itself). */
export type SqafClassification =
  | typeof INFRASTRUCTURE_ANTI_BOT
  | typeof INFRASTRUCTURE_NETWORK
  | typeof INFRASTRUCTURE_SUT_UNAVAILABLE
  | typeof TEST_DATA_INVALID
  | typeof API_REQUEST_FAILED
  | typeof AUTOMATION_LOCATOR_TIMEOUT
  | typeof ASSERTION_MISMATCH;

/** Every value the post-execution classification can assign. */
export type FailureClassification = SqafClassification | typeof UNCLASSIFIED;

/** Category of a classification: the part before the slash. */
export type CategoryOf<C extends SqafClassification> = C extends `${infer Category}/${string}` ? Category : never;

export type SqafCategory = CategoryOf<SqafClassification>;

/** Stable order used by reports (most external cause first). */
export const FAILURE_CLASSIFICATIONS: readonly FailureClassification[] = Object.freeze([
  INFRASTRUCTURE_ANTI_BOT,
  INFRASTRUCTURE_NETWORK,
  INFRASTRUCTURE_SUT_UNAVAILABLE,
  TEST_DATA_INVALID,
  API_REQUEST_FAILED,
  AUTOMATION_LOCATOR_TIMEOUT,
  ASSERTION_MISMATCH,
  UNCLASSIFIED,
]);

const SQAF_CLASSIFICATIONS: ReadonlySet<string> = new Set(FAILURE_CLASSIFICATIONS.filter((c) => c !== UNCLASSIFIED));

export function isSqafClassification(value: string): value is SqafClassification {
  return SQAF_CLASSIFICATIONS.has(value);
}

export function categoryOf<C extends SqafClassification>(classification: C): CategoryOf<C> {
  return classification.slice(0, classification.indexOf('/')) as CategoryOf<C>;
}

/** Stable, machine-readable prefix of every SQAF error message: `[SQAF:<classification>]`. */
export function classificationMarker(classification: SqafClassification): string {
  return `[SQAF:${classification}]`;
}
