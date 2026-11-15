/**
 * SQAF — Anti-bot challenge signatures of the System Under Test (Stage 1).
 *
 * Observed in GitHub Actions runs 43690859628 (attempt 1) and 43691579360 on
 * 2026-11-15: Automation Exercise (served through Cloudflare) answered with a
 * verification page instead of the application. See ADR-0006 and
 * docs/validation/E1-configuration.md.
 *
 * These signatures are used ONLY to detect and classify the challenge. SQAF
 * never tries to bypass it.
 */
export interface AntiBotSignatures {
  /** Exact document titles of the challenge page (compared after whitespace normalization). */
  readonly titles: readonly string[];
  /** Full sentences of the challenge page body (case-insensitive, whitespace-normalized). */
  readonly bodyPhrases: readonly string[];
}

export const CLOUDFLARE_CHALLENGE_SIGNATURES: AntiBotSignatures = Object.freeze({
  titles: Object.freeze(['One moment, please...']),
  bodyPhrases: Object.freeze(['Please wait while your request is being verified']),
});
