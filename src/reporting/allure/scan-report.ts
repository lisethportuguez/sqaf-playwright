import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { hostname } from 'node:os';
import { extname, join, relative } from 'node:path';

/**
 * SQAF — Allure leak scanner (Stage 6, Phase 2). See ADR-0011.
 *
 * FAIL-CLOSED check of every file that could reach a reader: the prepared
 * results, the generated report and the run history. Any finding blocks the
 * report (the pipeline deletes it). Findings name the detector, the file and
 * the embedded entry, NEVER the matched value.
 *
 * - The single-file report embeds its data as `d("<path>","<base64>")`
 *   entries and may carry `data:…;base64,` URIs: both are DECODED and scanned
 *   (a plain text search would miss them).
 * - Controlled exclusion of Allure's static resources (two rules, nothing else):
 *   1. The summary page embeds Allure's application as one
 *      `data:text/javascript` bundle. Its minified code contains tokens that
 *      look like an address or a card number. It is skipped ONLY when its
 *      SHA-256 is one of `KNOWN_STATIC_RESOURCES` (the bundle of the pinned
 *      Allure version, identical in every report); a different bundle is
 *      scanned like everything else.
 *   2. The report pages bundle third-party JavaScript whose licence headers
 *      contain their authors' addresses. Only those EXACT addresses (kept as
 *      SHA-256 in `KNOWN_STATIC_EMAIL_HASHES`) are ignored, and only outside
 *      the embedded data; every other detector still applies to the bundle.
 *   A new Allure version therefore makes the scan fail until its resources
 *   are reviewed and added here.
 * - A file whose type cannot be scanned as text, other than the image and
 *   font types the report uses, is itself a finding.
 *
 * All patterns use bounded quantifiers: the report holds base64 runs of
 * several MB, where unbounded patterns take minutes.
 */

export type LeakDetector =
  | 'email'
  | 'generated-password'
  | 'secret-pair'
  | 'card-number'
  | 'data-id'
  | 'account-address'
  | 'typed-value'
  | 'test-data-annotation'
  | 'host-name'
  | 'user-path'
  | 'unscannable-file';

export interface Leak {
  readonly detector: LeakDetector;
  /** File, relative to the scanned root when possible. */
  readonly file: string;
  /** `<file>` for the file text itself, or the embedded entry path. */
  readonly entry: string;
}

/**
 * SHA-256 of the addresses in the licence headers of the JavaScript bundled by
 * Allure 3.22.1 (Sortable and another library). Stored as hashes: the
 * addresses belong to real people and this repository is public.
 */
export const KNOWN_STATIC_EMAIL_HASHES: ReadonlySet<string> = new Set([
  'fd67a327d9d980068c7c7884813c1dc0a697e571454a1bb62523ab45d987d1a9',
  'ca46a71c997967b8875ceb82fd476026ea67a19ea68f566080ee355c819b7dc1',
  'c57b31c04075b96bd716ae6b0c43f874d8c67c088d0adf722ddec6feefa76508',
]);

/** SHA-256 of the decoded static bundles of Allure 3.22.1 (summary page application). */
export const KNOWN_STATIC_RESOURCES: ReadonlySet<string> = new Set([
  'a071a87e86848d8553dbe71263ff298bb898d102ffb1f0f254effe81942c5f76',
]);

const EMAIL = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)(?:[A-Za-z0-9-]{1,63}\.){1,8}[A-Za-z]{2,24}\b/g;
const GENERATED_PASSWORD = /Sqaf#[A-Za-z0-9_-]{16,}/;
/**
 * A password pair in a machine format (form body or query string, JSON) that
 * is not redacted. Prose such as `$.password: missing required field` is not
 * a pair, exactly as in the SQAF redaction (src/utils/redaction.ts).
 */
const SECRET_PAIR = /\b(?:password|passwd|pwd)=(?!\[REDACTED\])[^\s"&,;}\]]{1,64}|"(?:password|passwd|pwd)"\s{0,3}:\s{0,3}"(?!\[REDACTED\])[^"]{1,64}"/i;
/** `<run token>-<entropy>-<n>`: the unique part of a SQAF data id (tests/unit/security/versioned-account-ids.spec.ts). */
const DATA_ID = /\b[a-z0-9]{8}-[0-9a-f]{8}-\d{1,6}\b/;
const ACCOUNT_ADDRESS = /sqaf\.user-[a-z0-9]/i;
/** A value typed by a Playwright action that is not redacted (step title or call log). */
const TYPED_VALUE = /\b(?:Fill|Type|Press sequentially|Insert text) \\?"(?!\[REDACTED\])[^"\\]{1,200}\\?"|\b(?:fill|type|pressSequentially|insertText)\(\\?["'`](?!\[REDACTED\])/;
const TEST_DATA_ANNOTATION = /sqaf-test-data/;
const USER_PATH = /\b[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}(?!\[user\])[^\\/\s"']{1,64}|\/(?:home|Users)\/(?!\[user\])[A-Za-z0-9._-]{1,64}\//;
const CARD_CANDIDATE = /(?<!\d)\d{15,19}(?!\d)/g;
/**
 * Hash identifiers (Allure test result ids, history ids: 32+ hex characters)
 * can contain a run of 15–19 decimal digits that passes the Luhn check by
 * chance (observed in CI run 44029915954). A candidate is ignored ONLY when the
 * whole alphanumeric token around it is such a hex identifier; a card number
 * alone, between separators or next to ordinary letters is still found.
 */
const HEX_IDENTIFIER = /^[0-9a-f]{32,}$/i;

function hasCardNumber(text: string): boolean {
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    if (!passesLuhn(match[0])) continue;
    let start = match.index;
    let end = start + match[0].length;
    while (start > 0 && /[0-9A-Za-z]/.test(text[start - 1]!)) start -= 1;
    while (end < text.length && /[0-9A-Za-z]/.test(text[end]!)) end += 1;
    if (!HEX_IDENTIFIER.test(text.slice(start, end))) return true;
  }
  return false;
}

const TEXT_TYPES = new Set(['.html', '.htm', '.json', '.jsonl', '.js', '.mjs', '.css', '.txt', '.properties', '.svg', '.xml', '.csv', '.md']);
/** Binary types of a generated report and of kept screenshots. They are not text-scanned (see ADR-0011, residual risks). */
const BINARY_TYPES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.woff', '.woff2', '.ttf']);

const EMBEDDED_ENTRY = /d\("([^"]{1,512})","([A-Za-z0-9+/=]{0,})"\)/g;
const DATA_URI = /data:([a-z]{1,20}\/[a-z0-9.+-]{1,60});base64,([A-Za-z0-9+/=]{16,})/gi;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function hostPattern(host: string): RegExp | undefined {
  // Very short names (for example `pc`) would match ordinary words.
  if (host.length < 4) return undefined;
  return new RegExp(host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export interface ScanTextOptions {
  /** Static (bundled) text: the known licence addresses are ignored. Never set for result data. */
  readonly staticResource?: boolean;
  /** Host name to look for; defaults to this machine's. */
  readonly host?: string;
  /** Test seam: hashes of the allowed licence addresses (default `KNOWN_STATIC_EMAIL_HASHES`). */
  readonly staticEmailHashes?: ReadonlySet<string>;
}

/** Detectors that match a text (no values are returned). */
export function scanText(text: string, options: ScanTextOptions = {}): LeakDetector[] {
  const found = new Set<LeakDetector>();
  // JavaScript escapes `<`, `>` and quotes as <…; they are not part of an address.
  const unescaped = text.replace(/\\u00(?:3[cCeE]|22|27)/g, ' ');
  for (const match of unescaped.matchAll(EMAIL)) {
    const address = match[0].replace('%40', '@').toLowerCase();
    const allowed = options.staticEmailHashes ?? KNOWN_STATIC_EMAIL_HASHES;
    if (options.staticResource && allowed.has(sha256(Buffer.from(address, 'utf8')))) continue;
    found.add('email');
    break;
  }
  if (GENERATED_PASSWORD.test(text)) found.add('generated-password');
  if (SECRET_PAIR.test(text)) found.add('secret-pair');
  if (hasCardNumber(text)) found.add('card-number');
  if (DATA_ID.test(text)) found.add('data-id');
  if (ACCOUNT_ADDRESS.test(text)) found.add('account-address');
  if (TYPED_VALUE.test(text)) found.add('typed-value');
  if (TEST_DATA_ANNOTATION.test(text)) found.add('test-data-annotation');
  const host = hostPattern(options.host ?? hostname());
  if (host?.test(text)) found.add('host-name');
  if (USER_PATH.test(text)) found.add('user-path');
  return [...found];
}

export interface EmbeddedText {
  readonly entry: string;
  readonly text: string;
  /** Allure application code (licence addresses allowed), never result data. */
  readonly staticResource: boolean;
}

const BINARY_ENTRY = /\.(?:png|jpe?g|webp|gif|ico|woff2?|ttf)$/i;
const BINARY_DATA_URI = /^(?:image\/(?!svg)|font\/|application\/font)/i;
const STATIC_DATA_URI = /^(?:text|application)\/(?:javascript|css)$/i;

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

/**
 * Splits a report file into the texts to scan: the file itself, with every
 * embedded base64 payload removed (the page shell), and each payload decoded.
 * Binary payloads (images, fonts) and the pinned Allure bundles
 * (`KNOWN_STATIC_RESOURCES`) are not returned.
 */
export function decodeEmbedded(raw: string): { readonly shell: string; readonly entries: readonly EmbeddedText[] } {
  const entries: EmbeddedText[] = [];
  let shell = raw.replace(EMBEDDED_ENTRY, (_m, entry: string, payload: string) => {
    if (!BINARY_ENTRY.test(entry)) entries.push({ entry, text: Buffer.from(payload, 'base64').toString('utf8'), staticResource: false });
    return 'd()';
  });
  shell = shell.replace(DATA_URI, (_m, type: string, payload: string) => {
    if (BINARY_DATA_URI.test(type)) return 'data:;base64,';
    const decoded = Buffer.from(payload, 'base64');
    const staticResource = STATIC_DATA_URI.test(type);
    if (staticResource && KNOWN_STATIC_RESOURCES.has(sha256(decoded))) return 'data:;base64,';
    entries.push({ entry: `data:${type}`, text: decoded.toString('utf8'), staticResource });
    return 'data:;base64,';
  });
  return { shell, entries };
}

function listFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
}

export interface ScanOptions {
  readonly host?: string;
  /** Paths are reported relative to this directory. */
  readonly rootDir?: string;
}

/** Scans files and directories (recursively). Missing paths are skipped. */
export function scanPaths(paths: readonly string[], options: ScanOptions = {}): Leak[] {
  const leaks: Leak[] = [];
  const root = options.rootDir ?? process.cwd();
  for (const file of paths.flatMap(listFiles)) {
    const name = relative(root, file).replaceAll('\\', '/');
    const type = extname(file).toLowerCase();
    if (BINARY_TYPES.has(type)) continue;
    if (!TEXT_TYPES.has(type)) {
      leaks.push({ detector: 'unscannable-file', file: name, entry: '<file>' });
      continue;
    }
    const { shell, entries } = decodeEmbedded(readFileSync(file, 'utf8'));
    const host = options.host;
    for (const detector of scanText(shell, { staticResource: type === '.html' || type === '.js', ...(host ? { host } : {}) })) {
      leaks.push({ detector, file: name, entry: '<file>' });
    }
    for (const { entry, text, staticResource } of entries) {
      for (const detector of scanText(text, { staticResource, ...(host ? { host } : {}) })) leaks.push({ detector, file: name, entry });
    }
  }
  return leaks;
}

/** One line per finding, without any matched value. */
export function describeLeaks(leaks: readonly Leak[]): string {
  return leaks.map((leak) => `  - ${leak.detector} in ${leak.file}${leak.entry === '<file>' ? '' : ` (${leak.entry})`}`).join('\n');
}
