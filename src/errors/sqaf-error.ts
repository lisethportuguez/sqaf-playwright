import {
  categoryOf,
  classificationMarker,
  type CategoryOf,
  type SqafClassification,
} from './classifications';

/**
 * SQAF — Base error with context (Stage 5). See ADR-0008.
 *
 * Every error raised BY the framework extends SqafError, so a failure always
 * says what failed, where and why, in a fixed format:
 *
 *   [SQAF:<classification>] <summary>
 *   <Context key>: <value>        (one line per context entry)
 *   Evidence: <fact>              (one line per evidence item)
 *   <note>                        (optional)
 *
 * Context values whose KEY looks like a secret (password, token, secret,
 * credential, authorization, cookie) are always rendered as `[REDACTED]`, so
 * an error message can never leak a password to the console or a report.
 *
 * SqafError makes a test FAIL with an explicit cause; it is never caught to
 * turn a failure into a pass.
 */

export type ContextValue = string | number | boolean;
export type ErrorContext = Readonly<Record<string, ContextValue | undefined>>;

export interface SqafErrorDetails<C extends SqafClassification> {
  readonly classification: C;
  readonly summary: string;
  /** Facts about the operation (endpoint, URL, status...). Undefined values are omitted. */
  readonly context?: ErrorContext;
  /** Signatures, issues or other facts that justify the classification. */
  readonly evidence?: readonly string[];
  /** Closing sentence (for example, how the failure is reported). */
  readonly note?: string;
  readonly cause?: unknown;
}

export const REDACTED = '[REDACTED]';
const SECRET_KEY = /pass(word)?|secret|token|credential|authorization|cookie/i;

/** Drops undefined values and redacts secret-looking keys. */
export function sanitizeContext(context: ErrorContext = {}): Readonly<Record<string, ContextValue>> {
  const out: Record<string, ContextValue> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    out[key] = SECRET_KEY.test(key) ? REDACTED : value;
  }
  return Object.freeze(out);
}

export function formatSqafMessage(details: SqafErrorDetails<SqafClassification>): string {
  const context = sanitizeContext(details.context);
  return [
    `${classificationMarker(details.classification)} ${details.summary}`,
    ...Object.entries(context).map(([key, value]) => `${key}: ${value}`),
    ...(details.evidence ?? []).map((item) => `Evidence: ${item}`),
    ...(details.note ? [details.note] : []),
  ].join('\n');
}

export abstract class SqafError<C extends SqafClassification = SqafClassification> extends Error {
  readonly classification: C;
  readonly category: CategoryOf<C>;
  readonly summary: string;
  readonly context: Readonly<Record<string, ContextValue>>;
  readonly evidence: readonly string[];

  protected constructor(details: SqafErrorDetails<C>) {
    super(formatSqafMessage(details), details.cause === undefined ? undefined : { cause: details.cause });
    this.classification = details.classification;
    this.category = categoryOf(details.classification);
    this.summary = details.summary;
    this.context = sanitizeContext(details.context);
    this.evidence = Object.freeze([...(details.evidence ?? [])]);
  }
}

export function isSqafError(value: unknown): value is SqafError {
  return value instanceof SqafError;
}
