import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 3 security adjustment (ADR-0009 D16) — RUNTIME contract of the
 * credential-safe evidence policy, with a real browser and the real
 * Playwright artifacts (HTML and JSON reports, test-results, console).
 *
 * It does NOT contact the SUT: a fake SUT (login page + account API) runs in
 * this process and records every password it receives, so the artifacts can
 * be searched for those exact values. It lives in the integration project
 * only because it needs Chromium (CI installs it after the unit tests).
 *
 * The samples are in tests/unit/support/credential-samples and run under the
 * GENERAL CI evidence policy (trace and video retained on failure).
 */

const CLI = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = join('tests', 'unit', 'support', 'credential-samples.config.ts');

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

interface FakeSut {
  readonly baseURL: string;
  /** Every password received by the API. */
  readonly passwords: string[];
  readonly accounts: Map<string, string>;
  readonly created: () => number;
  close(): Promise<void>;
}

async function body(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function startFakeSut(): Promise<FakeSut> {
  const passwords: string[] = [];
  const accounts = new Map<string, string>();
  let created = 0;
  const json = (status: number, payload: unknown) => ({ status, payload: JSON.stringify(payload) });
  const server: Server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const form = await body(req);
      let answer: { status: number; payload: string };
      if (url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(LOGIN_PAGE);
        return;
      } else if (url.pathname === '/api/createAccount' && req.method === 'POST') {
        passwords.push(form.get('password') ?? '');
        accounts.set(form.get('email') ?? '', form.get('password') ?? '');
        created += 1;
        answer = json(200, { responseCode: 201, message: 'User created!' });
      } else if (url.pathname === '/api/deleteAccount' && req.method === 'DELETE') {
        passwords.push(form.get('password') ?? '');
        const deleted = accounts.delete(form.get('email') ?? '');
        answer = json(200, deleted ? { responseCode: 200, message: 'Account deleted!' } : { responseCode: 404, message: 'Account not found!' });
      } else if (url.pathname === '/api/getUserDetailByEmail') {
        const email = url.searchParams.get('email') ?? '';
        answer = accounts.has(email)
          ? json(200, { responseCode: 200, user: { id: 1, name: 'SQAF Tester', email } })
          : json(200, { responseCode: 404, message: 'Account not found with this email, try another email!' });
      } else {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(answer.status, { 'Content-Type': 'text/html; charset=utf-8' }).end(answer.payload);
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseURL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    passwords,
    accounts,
    created: () => created,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface Run {
  readonly status: number | null;
  readonly output: string;
  readonly dir: string;
}

/** Runs the samples in a child Playwright process (async: the fake SUT must keep answering). */
async function runSamples(dir: string, baseURL: string, files: readonly string[], extraEnv: Record<string, string> = {}): Promise<Run> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('SQAF_') || key === 'CI' || key === 'GITHUB_STEP_SUMMARY') continue;
    if (key.startsWith('TEST_') || key.startsWith('PW_') || key.startsWith('PLAYWRIGHT_')) continue;
    env[key] = value;
  }
  Object.assign(env, {
    FORCE_COLOR: '0',
    SAMPLE_BASE_URL: baseURL,
    SAMPLE_OUTPUT_DIR: join(dir, 'test-results'),
    SAMPLE_HTML_DIR: join(dir, 'html'),
    SAMPLE_JSON: join(dir, 'report.json'),
    ...extraEnv,
  });
  const child = spawn(process.execPath, [CLI, 'test', '-c', CONFIG, ...files], { cwd: process.cwd(), env });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
  const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
  return { status, output, dir };
}

/** Entries of a ZIP archive (stored or deflated), enough for Playwright traces and reports. */
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

interface Artifact {
  readonly path: string;
  readonly text: string;
}

/** Every artifact of a run as text, with ZIP files (traces) and the HTML report's embedded data expanded. */
function artifacts(run: Run): Artifact[] {
  const out: Artifact[] = [{ path: '<console>', text: run.output }];
  const add = (path: string, content: Buffer): void => {
    if (/\.zip$/i.test(path)) {
      for (const [name, entry] of unzip(content)) add(`${path}!${name}`, entry);
      return;
    }
    const text = content.toString('latin1');
    out.push({ path, text });
    const embedded = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(text);
    if (embedded) add(`${path}!embedded.zip`, Buffer.from(embedded[1]!, 'base64'));
  };
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else add(path, readFileSync(path));
    }
  };
  walk(run.dir);
  return out;
}

function leaks(found: readonly Artifact[], secrets: readonly string[]): string[] {
  return found.filter((a) => secrets.some((s) => s.length > 0 && a.text.includes(s))).map((a) => a.path);
}

interface JsonReport {
  readonly suites: ReadonlyArray<{ readonly specs: ReadonlyArray<{ readonly title: string; readonly tests: ReadonlyArray<{ readonly results: ReadonlyArray<{ readonly status: string }> }> }> }>;
}

function statuses(run: Run): Record<string, string> {
  const report = JSON.parse(readFileSync(join(run.dir, 'report.json'), 'utf8')) as JsonReport;
  const out: Record<string, string> = {};
  for (const suite of report.suites) for (const spec of suite.specs) out[spec.title] = spec.tests[0]?.results[0]?.status ?? 'none';
  return out;
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(180_000);

test('credential tests under the policy leave no password in any artifact', async ({}, testInfo) => {
  const sut = await startFakeSut();
  try {
    const run = await runSamples(testInfo.outputPath('safe'), sut.baseURL, ['with-policy.sample.ts']);

    expect(statuses(run), run.output).toEqual({
      'passing: testUser logs in through the UI': 'passed',
      'failing assertion while the password is still in the form': 'failed',
      'failing action while the password is still in the form': 'failed',
      'failing API-only test with newUserData': 'failed',
    });
    // Non-vacuous: 4 accounts were created with real (generated) passwords, and all were deleted.
    expect(sut.created()).toBe(4);
    expect(new Set(sut.passwords).size).toBe(4);
    expect(sut.accounts.size).toBe(0);

    const found = artifacts(run);
    expect(leaks(found, sut.passwords)).toEqual([]);

    // Trace and video are off; screenshots (password masked by the browser) are kept on failure
    // (2: the API-only test opens no page).
    expect(found.filter((a) => /trace\.zip|\.webm$/.test(a.path)).map((a) => a.path)).toEqual([]);
    expect(found.filter((a) => /test-failed-\d+\.png$/.test(a.path))).toHaveLength(2);
    // The snapshot paths that used to expose the password were exercised and are clean.
    const contexts = found.filter((a) => /error-context\.md$/.test(a.path) && a.path.includes('test-results'));
    expect(contexts.some((a) => /textbox "Password"/.test(a.text))).toBe(true);
  } finally {
    await sut.close();
  }
});

test('credential fixtures refuse the general policy and create no account', async ({}, testInfo) => {
  const sut = await startFakeSut();
  try {
    const run = await runSamples(testInfo.outputPath('unsafe'), sut.baseURL, ['without-policy.sample.ts']);
    expect(run.status).not.toBe(0);
    expect(statuses(run)).toEqual({ 'testUser under the general evidence policy': 'failed' });
    expect(run.output).toContain('ConfigurationError');
    expect(run.output).toContain('test.use(CREDENTIAL_SAFE_EVIDENCE)');
    expect(sut.created()).toBe(0);
  } finally {
    await sut.close();
  }
});

test('control: without SQAF the same artifacts DO contain the password (the scanner detects leaks)', async ({}, testInfo) => {
  const sut = await startFakeSut();
  try {
    const secret = `Sqaf#${randomBytes(12).toString('base64url')}`;
    const run = await runSamples(testInfo.outputPath('control'), sut.baseURL, ['control.sample.ts'], { SAMPLE_CONTROL_SECRET: secret });
    expect(statuses(run)).toEqual({ 'raw fill and API form under the general policy': 'failed' });
    const where = leaks(artifacts(run), [secret]);
    expect(where.some((path) => /trace\.zip!/.test(path)), where.join('\n')).toBe(true);
    expect(where.some((path) => /index\.html!embedded\.zip!/.test(path)), where.join('\n')).toBe(true);
  } finally {
    await sut.close();
  }
});
