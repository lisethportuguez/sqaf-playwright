/**
 * SQAF — Centralized timeouts in milliseconds (Stage 1). See ADR-0005.
 *
 * Only condition-based waits are used in SQAF; these values are upper bounds,
 * never fixed sleeps.
 */
export interface TimeoutPolicy {
  /** Whole test, including hooks and fixtures. */
  readonly test: number;
  /** Web-first assertions (`expect`). */
  readonly expect: number;
  /** Each action (click, fill...). 0 = no limit other than the test timeout. */
  readonly action: number;
  /** Each navigation (goto, reload...). 0 = no limit other than the test timeout. */
  readonly navigation: number;
}

/** SQAF suites: bounded actions and navigations give earlier, clearer failures. */
export const SQAF_TIMEOUTS: TimeoutPolicy = Object.freeze({
  test: 30_000,
  expect: 5_000,
  action: 10_000,
  navigation: 30_000,
});

/**
 * Baseline: frozen Stage 0 conditions (Playwright 1.65 defaults, written out
 * explicitly). Changing them breaks the Stage 7 comparison.
 */
export const BASELINE_TIMEOUTS: TimeoutPolicy = Object.freeze({
  test: 30_000,
  expect: 5_000,
  action: 0,
  navigation: 0,
});

/**
 * SQAF API requests (Stage 3, account client). Separate from TimeoutPolicy so
 * the browser timeouts and the frozen baseline policy stay unchanged.
 */
export const SQAF_API_TIMEOUT = 15_000;
