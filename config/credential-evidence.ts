import type { EvidencePolicy } from './evidence';

/**
 * SQAF — Evidence policy of the tests that handle account credentials
 * (Stage 3 security adjustment). See ADR-0009 D16.
 *
 * Verified with Playwright 1.65 (docs/validation/E3-test-data-management.md §9):
 *  - trace.zip stores the API form bodies (password included), the `fill`
 *    parameters and the DOM value of password inputs → `off`.
 *  - video is a recording of the screen; password inputs are masked by the
 *    browser, but nothing else on the screen is controlled → `off`.
 *  - screenshots show password inputs as bullets → kept on failure, so a
 *    failure is still diagnosable.
 *
 * The general Stage 1 policy (`sqafEvidencePolicy`) is NOT changed: every
 * test that does not handle credentials keeps it. The credential fixtures
 * refuse to run under any other policy (see `credentialEvidenceViolations`).
 */
export const CREDENTIAL_EVIDENCE: EvidencePolicy = Object.freeze({
  trace: 'off',
  screenshot: 'only-on-failure',
  video: 'off',
});

/** Effective Playwright options, as the fixtures receive them (mode or `{ mode }`). */
export interface EffectiveEvidence {
  readonly trace: string | { readonly mode: string };
  readonly video: string | { readonly mode: string };
  readonly screenshot: string | { readonly mode: string };
}

const modeOf = (option: string | { readonly mode: string }): string => (typeof option === 'string' ? option : option.mode);

/**
 * Differences between an effective policy and the credential-safe one.
 * Empty when the policy is safe. `screenshot: 'off'` is also safe.
 */
export function credentialEvidenceViolations(effective: EffectiveEvidence): string[] {
  const violations: string[] = [];
  const trace = modeOf(effective.trace);
  const video = modeOf(effective.video);
  const screenshot = modeOf(effective.screenshot);
  if (trace !== 'off') violations.push(`trace is "${trace}" (must be "off")`);
  if (video !== 'off') violations.push(`video is "${video}" (must be "off")`);
  if (screenshot !== 'off' && screenshot !== 'only-on-failure') {
    violations.push(`screenshot is "${screenshot}" (must be "only-on-failure" or "off")`);
  }
  return violations;
}
