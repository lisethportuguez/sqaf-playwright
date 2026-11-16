import { CLOUDFLARE_CHALLENGE_SIGNATURES, type AntiBotSignatures } from '../../config/anti-bot';
import { normalizeText, stripAnsi } from '../utils/text';
import {
  ASSERTION_MISMATCH,
  AUTOMATION_LOCATOR_TIMEOUT,
  classificationMarker,
  FAILURE_CLASSIFICATIONS,
  INFRASTRUCTURE_ANTI_BOT,
  INFRASTRUCTURE_NETWORK,
  INFRASTRUCTURE_SUT_UNAVAILABLE,
  isSqafClassification,
  UNCLASSIFIED,
  type FailureClassification,
} from './classifications';

/**
 * SQAF — Post-execution failure classification (Stage 1, full taxonomy in
 * Stage 5). See ADR-0006 and ADR-0008.
 *
 * Pure function over the text of a failed attempt (error messages and, when
 * available, Playwright's error-context snapshot). It assigns ONE category for
 * analysis; it never changes the result of the test.
 *
 * Rules, in priority order (the first one that matches wins):
 *  1. infrastructure/anti-bot-challenge — Stage 1 rule, unchanged: SQAF marker,
 *     exact quoted challenge title or a full challenge sentence.
 *  2. Any other `[SQAF:<classification>]` marker: errors raised by SQAF
 *     classify themselves (test-data, api, network, sut-unavailable...).
 *  3. infrastructure/network — Chromium `net::ERR_*` codes (except
 *     ERR_BLOCKED_BY_CLIENT, which is the SQAF ad-blocking policy) and
 *     Node.js socket errors.
 *  4. infrastructure/sut-unavailable — a 5xx error page of the SUT or of
 *     Cloudflare (status code next to its standard reason phrase), seen in
 *     the page snapshot or in what Playwright RECEIVED. The expectation
 *     written by the test (`Expected: …`, `Locator: …`, call log) is ignored:
 *     a test that expects the text "502 Bad Gateway" is not an outage.
 *  5. automation/locator-timeout — a Playwright ACTION timed out while waiting
 *     for a locator.
 *  6. assertion/mismatch — a failed `expect(...)` assertion.
 *  7. unclassified.
 *
 * Text cannot tell a product defect from an automation defect behind a failed
 * assertion: `assertion/mismatch` only says that an expectation was not met.
 */

export type { FailureClassification } from './classifications';
export { FAILURE_CLASSIFICATIONS } from './classifications';

export interface FailureClassificationResult {
  readonly classification: FailureClassification;
  readonly evidence: readonly string[];
}

export interface FailureText {
  readonly errorMessages: readonly string[];
  /** Text of the error-context attachment (accessibility snapshot), if any. */
  readonly pageSnapshot?: string;
}

const SQAF_MARKER = /\[SQAF:([a-z-]+\/[a-z-]+)\]/;
const CHROMIUM_NET_ERROR = /\bnet::(ERR_[A-Z_]+)\b/g;
const IGNORED_NET_ERRORS: ReadonlySet<string> = new Set(['ERR_BLOCKED_BY_CLIENT']);
/** Node.js socket and DNS errors (`getaddrinfo ENOENT` is the Windows DNS failure observed in Stage 3). */
const NODE_SOCKET_ERROR =
  /\b(getaddrinfo [A-Z_]+|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH|socket hang up)\b/;
/** HTTP 5xx (and Cloudflare 52x) status codes followed by their standard reason phrase. */
const SERVER_ERROR =
  /\b(500|502|503|504|520|521|522|523|524)\b\s*[:\-–]?\s*(Internal Server Error|Bad Gateway|Service (?:Temporarily )?Unavailable|Gateway Time-?out|Web server is returning an unknown error|Web server is down|Connection timed out|Origin is unreachable|A timeout occurred)/i;
const ACTION_TIMEOUT = /\b(?:locator|page|frame|elementHandle)\.[A-Za-z]+: (?:Timeout|Test timeout of) \d+ms exceeded/;
const WAITING_FOR_LOCATOR = /waiting for (?:locator\(|getBy[A-Z][A-Za-z]*\(|frameLocator\()/;
/** A ```yaml accessibility snapshot block of the error-context attachment. */
const YAML_BLOCK = /```yaml\r?\n[\s\S]*?\r?\n```/g;
/** Lines that describe what the TEST asked for, not what the SUT answered. */
const EXPECTATION_LINE = /^\s*(?:Expected\b[^:\n]*:|Locator:|Call log:|- |>?\s*\d+\s*\|)/;
const FAILED_EXPECT = /\bexpect\((?:locator|page|received|response|value)\)\.(?:not\.)?[A-Za-z]+\(/;

function antiBotEvidence(messages: readonly string[], snapshot: string, signatures: AntiBotSignatures): string[] {
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
  return evidence;
}

/** A failure message without the lines that only repeat the test's expectation. */
function observedText(message: string): string {
  return message
    .split('\n')
    .filter((line) => !EXPECTATION_LINE.test(line))
    .join('\n');
}

function result(classification: FailureClassification, evidence: readonly string[]): FailureClassificationResult {
  return { classification, evidence: Object.freeze([...evidence]) };
}

export function classifyFailure(
  failure: FailureText,
  signatures: AntiBotSignatures = CLOUDFLARE_CHALLENGE_SIGNATURES,
): FailureClassificationResult {
  const messages = failure.errorMessages.map(normalizeText);
  const rawSnapshot = normalizeText(failure.pageSnapshot ?? '');
  const snapshot = rawSnapshot.toLowerCase();

  // 1. Anti-bot challenge (Stage 1 rule, unchanged).
  const antiBot = antiBotEvidence(messages, snapshot, signatures);
  if (antiBot.length > 0) return result(INFRASTRUCTURE_ANTI_BOT, antiBot);

  // 2. Errors raised by SQAF carry their own classification.
  for (const message of messages) {
    const marker = SQAF_MARKER.exec(message)?.[1];
    if (marker !== undefined && isSqafClassification(marker)) {
      return result(marker, [`error raised as ${classificationMarker(marker)}`]);
    }
  }

  // 3. Network.
  const netCodes = new Set<string>();
  for (const message of messages) {
    for (const match of message.matchAll(CHROMIUM_NET_ERROR)) {
      if (!IGNORED_NET_ERRORS.has(match[1]!)) netCodes.add(match[1]!);
    }
  }
  if (netCodes.size > 0) return result(INFRASTRUCTURE_NETWORK, [...netCodes].map((code) => `network error net::${code}`));
  for (const message of messages) {
    const socket = NODE_SOCKET_ERROR.exec(message)?.[1];
    if (socket !== undefined) return result(INFRASTRUCTURE_NETWORK, [`network error ${socket}`]);
  }

  // 4. SUT unavailable (5xx error page in the received values or the page snapshot).
  const observed = failure.errorMessages.map((message) => normalizeText(observedText(stripAnsi(message))));
  for (const text of [...observed, rawSnapshot]) {
    const server = SERVER_ERROR.exec(text);
    if (server) return result(INFRASTRUCTURE_SUT_UNAVAILABLE, [`server error ${server[1]} ${server[2]}`]);
  }

  // 5. An action timed out waiting for a locator.
  for (const message of messages) {
    const timeout = ACTION_TIMEOUT.exec(message);
    if (timeout && WAITING_FOR_LOCATOR.test(message)) {
      return result(AUTOMATION_LOCATOR_TIMEOUT, [`action timeout "${timeout[0]}" while waiting for a locator`]);
    }
  }

  // 6. Failed assertion.
  for (const message of messages) {
    const assertion = FAILED_EXPECT.exec(message);
    if (assertion) return result(ASSERTION_MISMATCH, [`failed assertion ${assertion[0]}…)`]);
  }

  return result(UNCLASSIFIED, []);
}

/**
 * Page part of Playwright's `error-context` attachment.
 *
 * Since Playwright 1.5x the attachment is a Markdown document with sections
 * (`# Instructions`, `# Test info`, `# Error details`, `# Page snapshot`,
 * `# Test source`). The page appears as ```yaml accessibility snapshots in
 * TWO places (verified in playwright/lib/index.js, 1.65):
 *  - inside `# Error details`, after the message of a failed `expect` on a
 *    locator or page (the snapshot taken by the matcher), and
 *  - in `# Page snapshot`, only when no matcher snapshot exists.
 * Only those yaml blocks are page text. The rest repeats the error message
 * (already classified) or is the TEST SOURCE CODE, whose string literals
 * must never be mistaken for page text (Stage 5 fix).
 *
 * Returns the yaml blocks of both sections, `undefined` if the document has
 * sections but no snapshot, or the whole text when it has no sections (raw
 * snapshot).
 */
export function pageSnapshotSection(errorContext: string): string | undefined {
  const headings = [...errorContext.matchAll(/^# .+$/gm)];
  if (headings.length === 0) return errorContext;
  const blocks: string[] = [];
  headings.forEach((heading, index) => {
    if (!/^# (?:error details|page snapshot)\s*$/i.test(heading[0])) return;
    const start = heading.index! + heading[0].length;
    const end = headings[index + 1]?.index ?? errorContext.length;
    for (const block of errorContext.slice(start, end).matchAll(YAML_BLOCK)) {
      blocks.push(block[0]);
    }
  });
  return blocks.length > 0 ? blocks.join('\n') : undefined;
}

/** Zero count for every classification, in report order. */
export function emptyClassificationCounts(): Record<FailureClassification, number> {
  return Object.fromEntries(FAILURE_CLASSIFICATIONS.map((name) => [name, 0])) as Record<FailureClassification, number>;
}
