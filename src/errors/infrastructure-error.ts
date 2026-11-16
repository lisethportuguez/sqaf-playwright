import {
  INFRASTRUCTURE_ANTI_BOT,
  INFRASTRUCTURE_NETWORK,
  INFRASTRUCTURE_SUT_UNAVAILABLE,
} from './classifications';
import { SqafError, type ErrorContext } from './sqaf-error';

/**
 * SQAF — Infrastructure errors (Stage 1, extended in Stage 5). See ADR-0006
 * and ADR-0008.
 *
 * An external cause outside the product and the automation: an anti-bot
 * challenge, a network failure or an unavailable SUT. The test FAILS with
 * this explicit cause; it is never caught to turn a failure into a pass and
 * is not retried specially.
 *
 * Stage 1 compatibility: same name, `category`, `classification`, `evidence`,
 * `url` and message format (`[SQAF:...] summary`, `URL:`, `Evidence:` and the
 * closing sentence).
 */

export { classificationMarker, INFRASTRUCTURE_ANTI_BOT } from './classifications';

export type InfrastructureClassification =
  | typeof INFRASTRUCTURE_ANTI_BOT
  | typeof INFRASTRUCTURE_NETWORK
  | typeof INFRASTRUCTURE_SUT_UNAVAILABLE;

export interface InfrastructureErrorDetails {
  readonly classification: InfrastructureClassification;
  readonly summary: string;
  /** Signatures or other facts that justify the classification. */
  readonly evidence: readonly string[];
  readonly url?: string;
  /** Additional facts (Stage 5), rendered after the URL. */
  readonly context?: ErrorContext;
  readonly cause?: unknown;
}

const NOTE = 'This is an external infrastructure failure: the test is reported as FAILED and is not retried specially.';

export class InfrastructureError extends SqafError<InfrastructureClassification> {
  override readonly name = 'InfrastructureError';
  readonly url: string | undefined;

  constructor(details: InfrastructureErrorDetails) {
    super({
      classification: details.classification,
      summary: details.summary,
      context: { URL: details.url, ...details.context },
      evidence: details.evidence,
      note: NOTE,
      cause: details.cause,
    });
    this.url = details.url;
  }
}
