/**
 * SQAF — Evidence policy (Stage 1). See ADR-0005.
 *
 * Evidence is kept only for failures, to keep artifacts small while making
 * every failure diagnosable.
 */
export interface EvidencePolicy {
  readonly trace: 'off' | 'retain-on-failure';
  readonly screenshot: 'off' | 'only-on-failure';
  readonly video: 'off' | 'retain-on-failure';
}

/** SQAF suites. Video only in CI, where the failure cannot be reproduced at the desk. */
export function sqafEvidencePolicy(isCI: boolean): EvidencePolicy {
  return Object.freeze({
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
  });
}

/**
 * Baseline: no evidence, as in Stage 0.
 *
 * Stage 0 declared `trace: 'on-first-retry'` globally while the baseline ran
 * with `retries: 0`. A first retry never happens, so no trace was ever
 * recorded: the effective value was `off`. Stage 1 writes `off` explicitly so
 * the condition is unambiguous; the effective behaviour does not change.
 */
export const BASELINE_EVIDENCE: EvidencePolicy = Object.freeze({
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});
