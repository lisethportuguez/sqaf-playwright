import {
  categoryOf,
  classificationMarker,
  type CategoryOf,
  type SqafClassification,
} from './classifications';
import { REDACTED, redactSecrets, SECRET_KEY } from '../utils/redaction';

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
 * Secrets never reach a message (ADR-0008 D9):
 *  - context values whose KEY looks like a secret (password, token, secret,
 *    credential, authorization, cookie) are rendered as `[REDACTED]`, at any
 *    depth of nested objects and arrays;
 *  - every text (summary, string values, evidence, note) goes through
 *    `redactSecrets`: `password=…`-style pairs and SQAF-generated passwords;
 *  - the CAUSE chain is replaced by sanitized copies (same name, redacted
 *    message and stack, sanitized `cause` recursively), because Playwright
 *    serializes `error.cause` into its reports. The original cause object is
 *    not kept.
 *
 * SqafError makes a test FAIL with an explicit cause; it is never caught to
 * turn a failure into a pass.
 */

export type ContextPrimitive = string | number | boolean | null;
/** A context value: a primitive, or nested arrays/objects of them (redacted by key at any depth). */
export type ContextValue = ContextPrimitive | readonly ContextValue[] | { readonly [key: string]: ContextValue | undefined };
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

export { REDACTED };
const MAX_DEPTH = 8;
const OMITTED = '[omitted]';

function sanitizeValue(value: ContextValue, depth: number, seen: WeakSet<object>): ContextValue {
  if (typeof value === 'string') return redactSecrets(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH || seen.has(value)) return OMITTED;
  seen.add(value);
  if (Array.isArray(value)) {
    return Object.freeze((value as readonly ContextValue[]).map((item) => sanitizeValue(item, depth + 1, seen)));
  }
  const out: Record<string, ContextValue> = {};
  for (const [key, item] of Object.entries(value as Record<string, ContextValue | undefined>)) {
    if (item === undefined) continue;
    out[key] = SECRET_KEY.test(key) ? REDACTED : sanitizeValue(item, depth + 1, seen);
  }
  return Object.freeze(out);
}

/** Drops undefined values and redacts secret-looking keys and texts, at any depth. */
export function sanitizeContext(context: ErrorContext = {}): Readonly<Record<string, ContextValue>> {
  return sanitizeValue(context as ContextValue, 0, new WeakSet()) as Readonly<Record<string, ContextValue>>;
}

/**
 * Sanitized copy of an error cause, for the cause chain of a SqafError.
 * Errors become plain Errors with the same name and redacted message, stack
 * and (recursively) cause; other values are sanitized like context values.
 * A SqafError is already sanitized and is kept as is.
 */
export function sanitizeCause(cause: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof cause === 'string') return redactSecrets(cause);
  if (cause === null || typeof cause !== 'object') return cause;
  if (cause instanceof SqafError) return cause;
  if (depth >= MAX_DEPTH || seen.has(cause)) return OMITTED;
  seen.add(cause);
  if (cause instanceof Error) {
    const inner = (cause as { cause?: unknown }).cause;
    const copy = new Error(
      redactSecrets(cause.message),
      inner === undefined ? undefined : { cause: sanitizeCause(inner, depth + 1, seen) },
    );
    copy.name = cause.name;
    if (cause.stack !== undefined) copy.stack = redactSecrets(cause.stack);
    return copy;
  }
  try {
    return sanitizeValue(JSON.parse(JSON.stringify(cause)) as ContextValue, depth, seen);
  } catch {
    return OMITTED;
  }
}

function renderValue(value: ContextValue): string {
  return value !== null && typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function formatSqafMessage(details: SqafErrorDetails<SqafClassification>): string {
  const context = sanitizeContext(details.context);
  return [
    `${classificationMarker(details.classification)} ${redactSecrets(details.summary)}`,
    ...Object.entries(context).map(([key, value]) => `${key}: ${renderValue(value)}`),
    ...(details.evidence ?? []).map((item) => `Evidence: ${redactSecrets(item)}`),
    ...(details.note ? [redactSecrets(details.note)] : []),
  ].join('\n');
}

export abstract class SqafError<C extends SqafClassification = SqafClassification> extends Error {
  readonly classification: C;
  readonly category: CategoryOf<C>;
  readonly summary: string;
  readonly context: Readonly<Record<string, ContextValue>>;
  readonly evidence: readonly string[];

  protected constructor(details: SqafErrorDetails<C>) {
    super(formatSqafMessage(details), details.cause === undefined ? undefined : { cause: sanitizeCause(details.cause) });
    this.classification = details.classification;
    this.category = categoryOf(details.classification);
    this.summary = redactSecrets(details.summary);
    this.context = sanitizeContext(details.context);
    this.evidence = Object.freeze((details.evidence ?? []).map(redactSecrets));
  }
}

export function isSqafError(value: unknown): value is SqafError {
  return value instanceof SqafError;
}
