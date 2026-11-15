/**
 * SQAF — Infrastructure errors (Stage 1, minimal subset of the Error Handling
 * layer planned for Stage 5). See ADR-0006.
 *
 * An InfrastructureError makes the test FAIL with an explicit cause. It is
 * never caught to turn a failure into a pass.
 */

export const INFRASTRUCTURE_ANTI_BOT = 'infrastructure/anti-bot-challenge' as const;

export type InfrastructureClassification = typeof INFRASTRUCTURE_ANTI_BOT;

/** Stable, machine-readable prefix of every InfrastructureError message. */
export function classificationMarker(classification: InfrastructureClassification): string {
  return `[SQAF:${classification}]`;
}

export interface InfrastructureErrorDetails {
  readonly classification: InfrastructureClassification;
  readonly summary: string;
  /** Signatures or other facts that justify the classification. */
  readonly evidence: readonly string[];
  readonly url?: string;
}

export class InfrastructureError extends Error {
  override readonly name = 'InfrastructureError';
  readonly category = 'infrastructure' as const;
  readonly classification: InfrastructureClassification;
  readonly evidence: readonly string[];
  readonly url: string | undefined;

  constructor(details: InfrastructureErrorDetails) {
    const lines = [
      `${classificationMarker(details.classification)} ${details.summary}`,
      ...(details.url ? [`URL: ${details.url}`] : []),
      ...details.evidence.map((item) => `Evidence: ${item}`),
      'This is an external infrastructure failure: the test is reported as FAILED and is not retried specially.',
    ];
    super(lines.join('\n'));
    this.classification = details.classification;
    this.evidence = Object.freeze([...details.evidence]);
    this.url = details.url;
  }
}
