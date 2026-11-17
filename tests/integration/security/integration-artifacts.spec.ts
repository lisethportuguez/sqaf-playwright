import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 4 (E4.5 security closure) — RUNTIME contract of what the integration
 * run of CI publishes. The integration HTML report (`integration-report`)
 * showed the synthetic test-account e-mails; CI no longer generates it.
 *
 * A child Playwright run executes samples shaped like the real integration
 * suites (tests/unit/support/integration-artifacts) with EXACTLY the
 * `--output` and `--reporter` arguments of the integration step of ci.yml,
 * and the upload paths of ci.yml select what would be published. Every
 * published file (its name and its content, traces expanded) and the job
 * summary are scanned for e-mail addresses, account data ids, passwords and
 * card numbers; the console (job log) for e-mails, passwords and cards.
 *
 * It does NOT contact the SUT: a fake SUT runs in this process and records the
 * accounts and passwords it receives. Controls prove the scan is not vacuous:
 * the files that are NOT published, and the HTML report of the previous
 * configuration, DO contain the synthetic data. Static contracts of the same
 * steps: tests/unit/ci/workflow-integration-artifacts.spec.ts.
 *
 * Self-contained on purpose: suites may only import the fixtures layer.
 */

const CLI = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = join(process.cwd(), 'tests', 'unit', 'support', 'integration-artifacts.config.ts');
const CARD_NUMBERS = (
  JSON.parse(readFileSync(join(process.cwd(), 'test-data', 'checkout', 'payment-cards.json'), 'utf8')) as { items: Array<{ cardNumber: string }> }
).items.map((card) => card.cardNumber);
/** Any e-mail address, plain or URL-encoded (same shape as `redactEmails`). */
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+(?:@|%40)(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/i;
/** Names of the screencast frames inside a trace (`page@<sha1>-<timestamp>.jpeg`): not addresses. */
// No trailing \b: inside the ZIP directory the name is followed by binary extra fields ("…jpegUT").
const TRACE_FRAME = /\bpage@[0-9a-f]{32}-\d+\.jpeg/g;
const hasEmail = (text: string): boolean => EMAIL_ADDRESS.test(text.replace(TRACE_FRAME, ''));

// ---------------------------------------------------------------- fake SUT

const LOGIN_PAGE = `<!doctype html><html><head><title>Automation Exercise - Signup / Login</title></head><body>
<header><a href="/">Home</a></header>
<h2>Login to your account</h2>
<form><input data-qa="login-email" type="email" placeholder="Email Address">
<input data-qa="login-password" type="password" placeholder="Password">
<button data-qa="login-button" type="button">Login</button></form>
<h2>New User Signup!</h2>
<form><input data-qa="signup-name" type="text" placeholder="Name">
<input data-qa="signup-email" type="email" placeholder="Email Address">
<button data-qa="signup-button" type="button">Signup</button></form>
</body></html>`;
const PRODUCTS_PAGE = `<!doctype html><html><head><title>Automation Exercise - All Products</title></head><body>
<h2 class="title text-center">All Products</h2><p>Blue Top</p></body></html>`;
const PAYMENT_PAGE = `<!doctype html><html><head><title>Automation Exercise - Payment</title></head><body>
<h2>Payment</h2><form><input data-qa="card-number" name="card_number" type="text"></form></body></html>`;

interface FakeSut {
  readonly baseURL: string;
  /** Every e-mail of an account created through the API. */
  readonly created: string[];
  /** Every password received by the API. */
  readonly passwords: string[];
  readonly accounts: Map<string, string>;
  close(): Promise<void>;
}

async function formOf(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function startFakeSut(): Promise<FakeSut> {
  const created: string[] = [];
  const passwords: string[] = [];
  const accounts = new Map<string, string>();
  const pages: Record<string, string> = { '/login': LOGIN_PAGE, '/products': PRODUCTS_PAGE, '/payment': PAYMENT_PAGE };
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const form = await formOf(req);
      const json = (payload: unknown): void => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(JSON.stringify(payload));
      };
      if (pages[url.pathname] !== undefined) {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(pages[url.pathname]);
      } else if (url.pathname === '/api/createAccount' && req.method === 'POST') {
        created.push(form.get('email') ?? '');
        passwords.push(form.get('password') ?? '');
        accounts.set(form.get('email') ?? '', form.get('password') ?? '');
        json({ responseCode: 201, message: 'User created!' });
      } else if (url.pathname === '/api/deleteAccount' && req.method === 'DELETE') {
        passwords.push(form.get('password') ?? '');
        json(accounts.delete(form.get('email') ?? '') ? { responseCode: 200, message: 'Account deleted!' } : { responseCode: 404, message: 'Account not found!' });
      } else if (url.pathname === '/api/getUserDetailByEmail') {
        const email = url.searchParams.get('email') ?? '';
        json(
          accounts.has(email)
            ? { responseCode: 200, user: { id: 1, name: 'SQAF Tester', email } }
            : { responseCode: 404, message: 'Account not found with this email, try another email!' },
        );
      } else {
        res.writeHead(404).end();
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    created,
    passwords,
    accounts,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ------------------------------------------------------- ci.yml (as written)

const WORKFLOW = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8').replaceAll('\r\n', '\n');

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  if (start < 0) throw new Error(`ci.yml has no step "${name}"`);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

/** `path:` of an upload step: one line, or a `|` block of lines. */
function uploadPaths(block: string): string[] {
  const lines = block.split('\n');
  const index = lines.findIndex((line) => /^\s+path:/.test(line));
  if (index < 0) return [];
  const inline = lines[index]!.replace(/^\s+path:\s*/, '').trim();
  if (inline !== '|') return [inline];
  const indent = lines[index]!.search(/\S/);
  const out: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() === '' || line.search(/\S/) <= indent) break;
    out.push(line.trim());
  }
  return out;
}

/** Arguments after `npm run test:integration --`, the integration upload steps and their paths. */
function ciIntegrationRun(): { args: string[]; uploadSteps: string[]; paths: string[] } {
  const command = stepBlock('Integration tests (Page Objects and fixtures)')
    .split('\n')
    .find((line) => line.includes('npm run test:integration'));
  if (!command) throw new Error('the integration step does not run npm run test:integration');
  const args = command.trim().replace(/^npm run test:integration\s*(--\s*)?/, '').split(/\s+/).filter(Boolean);
  const uploadSteps = [...WORKFLOW.matchAll(/\n      - name: (Upload integration[^\n]*)/g)].map((m) => m[1]!.trim());
  return { args, uploadSteps, paths: uploadSteps.flatMap((name) => uploadPaths(stepBlock(name))) };
}

/**
 * The sample of `tests/integration/<dir>/<name>.spec.ts` is
 * `<dir>/<name>.sample.ts`, so its output folder has `.sample.ts` after the
 * file part: `…/pages-products-*` selects `…/pages-products.sample.ts-*`.
 */
const forSamples = (pattern: string): string => pattern.replace(/^(test-results-integration\/[a-z0-9-]+)-\*\/$/, '$1.sample.ts-*/');

/** actions/upload-artifact semantics for the forms ci.yml uses: `*` within a segment, a trailing `/` selects a directory. */
function globMatches(pattern: string, file: string): boolean {
  if (pattern.startsWith('!')) throw new Error(`exclusions are not used by the integration uploads: ${pattern}`);
  const directory = pattern.endsWith('/');
  const source = pattern
    .replace(/\/$/, '')
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}${directory ? '/.+' : ''}$`).test(file);
}

// ------------------------------------------------------------------ scanner

interface ArtifactText {
  /** Relative POSIX path of the file, `!entry` for an entry of a ZIP archive. */
  readonly path: string;
  readonly text: string;
}

/** Entries of a ZIP archive (stored or deflated): enough for Playwright traces and reports. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a ZIP archive');
  const entries = new Map<string, Buffer>();
  let pointer = buffer.readUInt32LE(end + 16);
  for (let n = buffer.readUInt16LE(end + 10); n > 0; n -= 1) {
    const method = buffer.readUInt16LE(pointer + 10);
    const size = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const local = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    entries.set(name, method === 0 ? data : inflateRawSync(data));
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** Every file under `root`, as relative POSIX paths. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(root, path).replaceAll('\\', '/'));
    }
  };
  walk(root);
  return out.sort();
}

/** Text of the given files, with ZIP archives and the HTML report's embedded ZIP expanded. */
function expand(root: string, files: readonly string[]): ArtifactText[] {
  const out: ArtifactText[] = [];
  const add = (path: string, content: Buffer): void => {
    const text = content.toString('latin1');
    out.push({ path, text });
    if (/\.zip$/i.test(path)) {
      for (const [name, entry] of unzip(content)) add(`${path}!${name}`, entry);
      return;
    }
    const embedded = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(text);
    if (embedded) add(`${path}!embedded.zip`, Buffer.from(embedded[1]!, 'base64'));
  };
  for (const file of files) add(file, readFileSync(join(root, file)));
  return out;
}

/** Decoded data entries (`d("<path>","<base64>")`) of the single-file Allure report pages (ADR-0011). */
function expandAllureData(root: string, files: readonly string[]): ArtifactText[] {
  const out: ArtifactText[] = [];
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    for (const match of readFileSync(join(root, file), 'utf8').matchAll(/d\("([^"]{1,512})","([A-Za-z0-9+/=]*)"\)/g)) {
      if (/\.(png|jpe?g|webp|gif|woff2?|ttf)$/i.test(match[1]!)) continue;
      out.push({ path: `${file}!${match[1]}`, text: Buffer.from(match[2]!, 'base64').toString('utf8') });
    }
  }
  return out;
}

interface Finding {
  readonly path: string;
  readonly kind: string;
}

/** Where each forbidden value (or any e-mail address) appears, in the file NAME or in its content. */
function findSensitive(artifacts: readonly ArtifactText[], values: Readonly<Record<string, readonly string[]>>, anyEmail = true): Finding[] {
  const findings: Finding[] = [];
  for (const artifact of artifacts) {
    for (const [scope, where] of [['name', artifact.path], ['content', artifact.text]] as const) {
      if (anyEmail && hasEmail(where)) findings.push({ path: artifact.path, kind: `e-mail (${scope})` });
      for (const [kind, list] of Object.entries(values)) {
        if (list.some((value) => value.length > 0 && where.includes(value))) findings.push({ path: artifact.path, kind: `${kind} (${scope})` });
      }
    }
  }
  return findings;
}

// ------------------------------------------------------------- child runs

interface Run {
  readonly status: number | null;
  readonly console: string;
  readonly dir: string;
}

/**
 * Runs the samples in a child Playwright process whose working directory is
 * `dir`, as CI runs from the repository root: `--output`, the reporters'
 * `reports/` and the job summary all land in `dir`. Async: the fake SUT must
 * keep answering.
 */
async function runSamples(dir: string, baseURL: string, args: readonly string[], extraEnv: Record<string, string> = {}): Promise<Run> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('SQAF_') || key === 'CI' || key === 'GITHUB_STEP_SUMMARY') continue;
    if (key.startsWith('TEST_') || key.startsWith('PW_') || key.startsWith('PLAYWRIGHT_')) continue;
    env[key] = value;
  }
  Object.assign(env, { FORCE_COLOR: '0', SAMPLE_BASE_URL: baseURL, GITHUB_STEP_SUMMARY: join(dir, 'job-summary.md'), ...extraEnv });
  // The reporter modules of ci.yml are relative to the repository root.
  const absolute = args.map((arg) =>
    arg.startsWith('--reporter=')
      ? `--reporter=${arg
          .slice('--reporter='.length)
          .split(',')
          .map((name) => (name.startsWith('./') ? join(process.cwd(), name) : name))
          .join(',')}`
      : arg,
  );
  mkdirSync(dir, { recursive: true });
  const child = spawn(process.execPath, [CLI, 'test', '-c', CONFIG, ...absolute], { cwd: dir, env });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { status, console: output, dir };
}

/** `sqaf.<dataId>@example.com` → `<dataId>`. */
const dataIdOf = (email: string): string => /^sqaf\.([^@]+)@/.exec(email)?.[1] ?? '';

interface Summary {
  readonly projects: readonly string[];
  readonly totals: { readonly tests: number; readonly expected: number; readonly unexpected: number };
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(240_000);

test('the integration run of CI publishes no e-mail, account id, password or card number', async ({}, testInfo) => {
  const sut = await startFakeSut();
  try {
    const ci = ciIntegrationRun();
    expect(ci.uploadSteps).toEqual(['Upload integration summary', 'Upload integration failure evidence']);
    const run = await runSamples(testInfo.outputPath('ci'), sut.baseURL, ci.args);
    expect(run.status, run.console).toBe(1); // 4 sample checks fail on purpose

    // Non-vacuous: 3 accounts were created with generated passwords (the failing UI test runs twice), and all were deleted.
    expect(sut.created, run.console).toHaveLength(3);
    expect(sut.accounts.size).toBe(0);
    const dataIds = sut.created.map(dataIdOf);
    expect(dataIds.every((id) => id.length > 0)).toBe(true);
    const forbidden = {
      'account data id': dataIds,
      'account e-mail': sut.created,
      password: [...sut.passwords, 'not-a-real-password'],
      'generated password prefix': ['Sqaf#'],
      'card number': CARD_NUMBERS,
    };

    const files = listFiles(run.dir);
    const patterns = ci.paths.map(forSamples);
    const publishedFiles = files.filter((file) => patterns.some((pattern) => globMatches(pattern, file)));

    // What is published: the safe summary and the failure evidence of the product suite only.
    expect(publishedFiles).toContain('reports/run-summary.json');
    const evidence = publishedFiles.filter((f) => f !== 'reports/run-summary.json');
    expect(evidence.every((f) => f.startsWith('test-results-integration/pages-products.sample.ts-')), evidence.join('\n')).toBe(true);
    expect(evidence.some((f) => f.endsWith('/trace.zip'))).toBe(true);
    expect(evidence.some((f) => /\/test-failed-\d+\.png$/.test(f))).toBe(true);
    expect(evidence.some((f) => f.endsWith('/error-context.md'))).toBe(true);
    // No Playwright HTML report or raw JSON report is generated; the classification report is not published.
    // Stage 6 (ADR-0011): the only HTML is the sanitized and scanned Allure report, published by its own step.
    expect(files.some((f) => /(^|\/)playwright-report/.test(f))).toBe(false);
    expect(files.filter((f) => f.endsWith('.html')).every((f) => f.startsWith('allure-report/')), files.join('\n')).toBe(true);
    const allureReport = uploadPaths(stepBlock('Upload Allure report'));
    expect(allureReport).toEqual(['allure-report/']);
    const reportFiles = files.filter((file) => allureReport.some((pattern) => globMatches(pattern, file)));
    expect(reportFiles).toContain('allure-report/awesome/index.html');
    // Raw and prepared Allure results stay on the runner (no upload path matches them).
    expect(files.some((f) => f.startsWith('allure-results/'))).toBe(true);
    expect([...publishedFiles, ...reportFiles].some((f) => f.startsWith('allure-results'))).toBe(false);
    expect(files).toContain('reports/failure-classification.json');
    expect(publishedFiles).not.toContain('reports/failure-classification.json');

    const summary = JSON.parse(readFileSync(join(run.dir, 'reports', 'run-summary.json'), 'utf8')) as Summary;
    expect(summary.projects).toEqual(['integration']);
    expect(summary.totals).toMatchObject({ tests: 6, expected: 2, unexpected: 4 });

    // The scan: published files (names and content, traces expanded) and the job summary.
    const scanned = [...expand(run.dir, publishedFiles), ...expand(run.dir, ['job-summary.md'])];
    expect(scanned.some((a) => a.path.includes('trace.zip!'))).toBe(true);
    expect(findSensitive(scanned, forbidden)).toEqual([]);
    // The Allure report: its embedded data DECODED (any e-mail is a finding), and every page for the exact
    // values (the page shells bundle Allure's application, whose licence headers hold library authors' addresses).
    const allureData = expandAllureData(run.dir, reportFiles);
    expect(allureData.length).toBeGreaterThan(0);
    expect(allureData.some((a) => a.text.includes('products: a failing check whose evidence is published'))).toBe(true); // non-vacuous
    expect(findSensitive(allureData, forbidden)).toEqual([]);
    expect(findSensitive(expand(run.dir, reportFiles), forbidden, false)).toEqual([]);
    expect(readFileSync(join(run.dir, 'job-summary.md'), 'utf8')).toContain('### SQAF integration tests (integration; selection: all)');

    // The console (job log) shows no account e-mail, generated password or card number either.
    // Source literals such as the fictitious 'not-a-real-password' of the auth sample may appear in
    // Playwright's code frames: they are already public in the repository (like 'WrongPassword123').
    const consoleFindings = findSensitive(
      [{ path: '<console>', text: run.console }],
      { 'account data id': dataIds, 'account e-mail': sut.created, 'generated password': sut.passwords, 'card number': CARD_NUMBERS },
      false,
    );
    expect(consoleFindings).toEqual([]);

    // Controls: outputs that are NOT published do contain the synthetic data (the scan detects it).
    // (The Allure report is published by its own step and was scanned above.)
    const unpublished = expand(run.dir, files.filter((f) => !publishedFiles.includes(f) && !reportFiles.includes(f)));
    const leaks = findSensitive(unpublished, forbidden);
    const leaked = (kind: RegExp, folder: string): boolean =>
      leaks.some((l) => kind.test(l.kind) && l.path.startsWith(`test-results-integration/${folder}`));
    // Account suite: the credential guard redacts the e-mail in error-context.md to `[e-mail redacted]`, with no
    // data id (E4.5 final closure); the failure screenshot still shows the e-mail as pixels (not scannable), so
    // the folder stays unpublished.
    const accountContexts = unpublished.filter(
      (a) => a.path.startsWith('test-results-integration/data-account-api') && a.path.endsWith('/error-context.md'),
    );
    expect(accountContexts.length).toBeGreaterThan(0);
    for (const context of accountContexts) expect(context.text, context.path).toContain('[e-mail redacted]');
    expect(leaked(/^account data id/, 'data-account-api')).toBe(false);
    expect(unpublished.some((a) => a.path.startsWith('test-results-integration/data-account-api') && /test-failed-\d+\.png$/.test(a.path))).toBe(true);
    expect(leaked(/^e-mail/, 'pages-auth')).toBe(true);
    expect(leaked(/^card number/, 'pages-checkout-components')).toBe(true);
  } finally {
    await sut.close();
  }
});

test('control: the HTML report of the previous configuration shows the e-mails; the cleanup attachment does not', async ({}, testInfo) => {
  const sut = await startFakeSut();
  try {
    const dir = testInfo.outputPath('control');
    // The integration step before the E4.5 security closure: the HTML report (plus JSON to inspect it).
    const run = await runSamples(dir, sut.baseURL, ['--output=test-results-integration', '--reporter=html,json', 'data/'], {
      PLAYWRIGHT_HTML_OUTPUT_DIR: join(dir, 'playwright-report-integration'),
      PLAYWRIGHT_HTML_OPEN: 'never',
      PLAYWRIGHT_JSON_OUTPUT_FILE: join(dir, 'report.json'),
    });
    expect(sut.created, run.console).toHaveLength(3);
    expect(sut.accounts.size).toBe(0);

    // 1. The HTML report contains the synthetic e-mail of the test account.
    const report = expand(dir, listFiles(dir).filter((f) => f.startsWith('playwright-report-integration/')));
    expect(findSensitive(report, { 'account e-mail': sut.created }, false).length, run.console).toBeGreaterThan(0);
    // The scan also detects the account data id: the report keeps the internal `sqaf-test-data` annotation
    // and the cleanup attachment (both local diagnosis only; CI no longer generates this report).
    const reportIds = sut.created.map(dataIdOf);
    expect(findSensitive(report, { 'account data id': reportIds }, false).length, run.console).toBeGreaterThan(0);

    // 2. Where it comes from: the step title that Playwright writes for `fill` (`Fill "<e-mail>"`), stored in
    //    the report data (JSON inside the embedded ZIP). Each testUser attempt typed its own address.
    const fillTitle = (email: string): RegExp => new RegExp(`"title":\\s*"Fill \\\\"${email.replace(/[.+]/g, '\\$&')}\\\\"`);
    const typed = sut.created.filter((email) => report.some((a) => a.path.includes('!embedded.zip!') && fillTitle(email).test(a.text)));
    expect(typed, run.console).toHaveLength(2);

    // 3. Sanitized at the origin: the cleanup attachment keeps the data id, never the e-mail or the password.
    interface JsonResult {
      readonly attachments: ReadonlyArray<{ readonly name: string; readonly body?: string }>;
    }
    interface JsonSuite {
      readonly suites?: JsonSuite[];
      readonly specs: ReadonlyArray<{ readonly tests: ReadonlyArray<{ readonly results: JsonResult[] }> }>;
    }
    const json = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as { suites: JsonSuite[] };
    const results: JsonResult[] = [];
    const visit = (suite: JsonSuite): void => {
      for (const spec of suite.specs) for (const t of spec.tests) results.push(...t.results);
      for (const child of suite.suites ?? []) visit(child);
    };
    json.suites.forEach(visit);
    const cleanups = results.flatMap((r) => r.attachments.filter((a) => a.name === 'sqaf-account-cleanup'));
    expect(cleanups.length).toBeGreaterThanOrEqual(2);
    for (const attachment of cleanups) {
      const body = Buffer.from(attachment.body ?? '', 'base64').toString('utf8');
      expect(body).toMatch(/"dataId": "[^"]+"/);
      expect(body).not.toMatch(EMAIL_ADDRESS);
      for (const password of sut.passwords) expect(body).not.toContain(password);
    }
  } finally {
    await sut.close();
  }
});
