import { CLOUDFLARE_CHALLENGE_SIGNATURES, type AntiBotSignatures } from '../../config/anti-bot';
import { normalizeText } from '../utils/anti-bot-detector';
import { classificationMarker, INFRASTRUCTURE_ANTI_BOT } from './infrastructure-error';

/**
 * SQAF — Post-execution failure classification (Stage 1). See ADR-0006.
 *
 * Pure function over the text of a failed attempt (error messages and, when
 * available, Playwright's error-context snapshot). It assigns a CATEGORY for
 * analysis; it never changes the result of the test.
 *
 * Stage 1 only recognises anti-bot challenges. Everything else stays
 * `unclassified` until the full taxonomy of Stage 5 exists.
 */

export type FailureClassification = typeof INFRASTRUCTURE_ANTI_BOT | 'unclassified';

export interface FailureClassificationResult {
  readonly classification: FailureClassification;
  readonly evidence: readonly string[];
}

export interface FailureText {
  readonly errorMessages: readonly string[];
  /** Text of the error-context attachment (accessibility snapshot), if any. */
  readonly pageSnapshot?: string;
}

export function classifyFailure(
  failure: FailureText,
  signatures: AntiBotSignatures = CLOUDFLARE_CHALLENGE_SIGNATURES,
): FailureClassificationResult {
  const messages = failure.errorMessages.map(normalizeText);
  const snapshot = normalizeText(failure.pageSnapshot ?? '').toLowerCase();
  const evidence: string[] = [];

  const marker = classificationMarker(INFRASTRUCTURE_ANTI_BOT);
  if (messages.some((message) => message.includes(marker))) {
    evidence.push(`error raised as ${marker}`);
  }

  for (const title of signatures.titles) {
    // The title counts only as a complete quoted value, as Playwright prints a
    // received title: Received: "One moment, please...".
    const quoted = `"${normalizeText(title)}"`;
    if (messages.some((message) => message.includes(quoted))) {
      evidence.push(`received title ${quoted}`);
    }
  }

  for (const phrase of signatures.bodyPhrases) {
    const needle = normalizeText(phrase).toLowerCase();
    if (messages.some((message) => message.toLowerCase().includes(needle)) || snapshot.includes(needle)) {
      evidence.push(`page text "${phrase}"`);
    }
  }

  return evidence.length > 0
    ? { classification: INFRASTRUCTURE_ANTI_BOT, evidence: Object.freeze(evidence) }
    : { classification: 'unclassified', evidence: Object.freeze([]) };
}
