import { isInteger, isNonEmptyString, isRecord } from '../utils/guards';

/**
 * SQAF — Structured HTTP evidence of a failed attempt (Stage 5 adjustment).
 * See ADR-0008 D14.
 *
 * Text rules cannot recognise every outage page: in CI run 43799046248 the
 * SUT answered a login POST with HTTP 503 and a "queue full" page that has no
 * standard reason phrase, and the failure was classified assertion/mismatch.
 * The HTTP status is the reliable signal, so the fixtures record the status
 * of the last MAIN-FRAME DOCUMENT response and attach it to a failed attempt;
 * the reporter reads the attachment and the classifier uses the status.
 *
 * This module is the shared contract (attachment name, shape and parser): the
 * fixtures write it and the reporter reads it, and neither imports the other.
 * The URL keeps only origin and path: query strings and fragments may carry
 * tokens and are never recorded.
 */

export const HTTP_EVIDENCE_ATTACHMENT = 'sqaf-http-evidence';

export interface DocumentResponse {
  readonly method: string;
  /** Origin and path only. */
  readonly url: string;
  readonly status: number;
  readonly statusText: string;
}

export interface HttpEvidence {
  readonly schemaVersion: 1;
  /** Last response to a navigation of the main frame before the attempt ended. */
  readonly lastDocument: DocumentResponse;
}

/** Origin and path of a URL; never its query string or fragment. */
export function evidenceUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '(unparseable URL)';
  }
}

/** True for a 5xx status (including the Cloudflare 52x range). */
export function isServerErrorStatus(status: number): boolean {
  return Number.isInteger(status) && status >= 500 && status <= 599;
}

/** Parses the attachment body; `undefined` when it is missing or malformed (never throws). */
export function parseHttpEvidence(text: string | undefined): HttpEvidence | undefined {
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(value) || value['schemaVersion'] !== 1 || !isRecord(value['lastDocument'])) return undefined;
  const doc = value['lastDocument'];
  if (!isInteger(doc['status']) || !isNonEmptyString(doc['method']) || typeof doc['url'] !== 'string') return undefined;
  return Object.freeze({
    schemaVersion: 1,
    lastDocument: Object.freeze({
      method: doc['method'],
      url: doc['url'],
      status: doc['status'],
      statusText: typeof doc['statusText'] === 'string' ? doc['statusText'] : '',
    }),
  });
}
