import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 5 adjustment (ADR-0008 D14) — RUNTIME contract of the structured HTTP
 * evidence, with a real browser, the real SQAF fixtures and the real failure
 * classification reporter.
 *
 * It does NOT contact the SUT: a fake SUT in this process reproduces CI run
 * 43799046248, where the login POST was answered with HTTP 503 and a
 * "This website is under heavy load (queue full)" page. Samples:
 * tests/unit/support/http-samples (run under the general CI evidence policy).
 */

const CLI = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');
const CONFIG = join('tests', 'unit', 'support', 'http-samples.config.ts');

const page = (title: string, body: string): string =>
  `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const LOGIN = page(
  'Automation Exercise - Signup / Login',
  `<h2>Login to your account</h2>
<form method="post" action="/login"><input data-qa="login-email" type="email" name="email" placeholder="Email Address">
<input data-qa="login-password" type="password" name="password" placeholder="Password">
<button data-qa="login-button" type="submit">Login</button></form>
<h2>New User Signup!</h2>
<form><input data-qa="signup-name" type="text" placeholder="Name"><input data-qa="signup-email" type="email" placeholder="Email Address">
<button data-qa="signup-button" type="button">Signup</button></form>`,
);

/** The real CI page had no title reason phrase; this mirrors its text. */
const QUEUE_FULL = page(
  'automationexercise.com',
  `<h1>This website is under heavy load (queue full)</h1>
<p>We're sorry, too many people are accessing this website at the same time. We're working on this problem. Please try again later.</p>`,
);

async function formOf(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

interface JsonReport {
  readonly suites: ReadonlyArray<{
    readonly specs: ReadonlyArray<{
      readonly title: string;
      readonly tests: ReadonlyArray<{ readonly results: ReadonlyArray<{ readonly status: string; readonly attachments: ReadonlyArray<{ readonly name: string }> }> }>;
    }>;
  }>;
}

interface Classification {
  readonly failures: ReadonlyArray<{ readonly test: string; readonly status: string; readonly classification: string; readonly evidence: readonly string[] }>;
}

test('an HTTP 503 "queue full" page is classified infrastructure/sut-unavailable from the HTTP status', async ({}, testInfo) => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/login' && req.method === 'POST') {
        const form = await formOf(req);
        if (form.get('email') === 'sqaf.queue-full@example.com') {
          res.writeHead(503, { 'Content-Type': 'text/html' }).end(QUEUE_FULL);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(LOGIN);
        }
        return;
      }
      if (url.pathname === '/healthy-broken-assets') {
        // The document is healthy; only a sub-resource and an iframe fail (must NOT count as an outage).
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(page('Healthy', '<p>Present</p><img src="/asset-503.png"><iframe src="/frame-503"></iframe>'));
        return;
      }
      if (url.pathname === '/asset-503.png' || url.pathname === '/frame-503') {
        // Late answers, so they arrive after the document.
        await new Promise((resolve) => setTimeout(resolve, 300));
        res.writeHead(503, { 'Content-Type': 'text/html' }).end(QUEUE_FULL);
        return;
      }
      if (url.pathname === '/login') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(LOGIN);
        return;
      }
      res.writeHead(404).end();
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const dir = testInfo.outputPath('run');
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;
      if (key.startsWith('SQAF_') || key === 'CI' || key === 'GITHUB_STEP_SUMMARY') continue;
      if (key.startsWith('TEST_') || key.startsWith('PW_') || key.startsWith('PLAYWRIGHT_')) continue;
      env[key] = value;
    }
    Object.assign(env, {
      FORCE_COLOR: '0',
      SAMPLE_BASE_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      SAMPLE_OUTPUT_DIR: join(dir, 'test-results'),
      SAMPLE_JSON: join(dir, 'report.json'),
      SAMPLE_CLASSIFICATION: join(dir, 'classification.json'),
    });
    const child = spawn(process.execPath, [CLI, 'test', '-c', CONFIG], { cwd: process.cwd(), env });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    const status = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect(status, output).toBe(1); // 4 samples fail on purpose; the reporter never changes the exit code

    // Statuses and attachments, from Playwright's own JSON reporter.
    const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as JsonReport;
    const results = Object.fromEntries(report.suites.flatMap((s) => s.specs).map((spec) => [spec.title, spec.tests[0]!.results[0]!]));
    const hasEvidence = (title: string): boolean => results[title]!.attachments.some((a) => a.name === 'sqaf-http-evidence');
    expect(Object.fromEntries(Object.entries(results).map(([title, r]) => [title, r.status]))).toEqual({
      'queue full: the login POST is answered with HTTP 503': 'failed',
      'control: the login POST is answered with HTTP 200 and no error message': 'failed',
      'control: a locator timeout on a healthy page': 'failed',
      'passing: no HTTP evidence is attached': 'passed',
      'control: a healthy page whose image and iframe are answered with HTTP 503': 'failed',
    });
    expect(hasEvidence('queue full: the login POST is answered with HTTP 503')).toBe(true);
    expect(hasEvidence('passing: no HTTP evidence is attached')).toBe(false);

    // Classification by the real reporter.
    const classification = JSON.parse(readFileSync(join(dir, 'classification.json'), 'utf8')) as Classification;
    const byTest = Object.fromEntries(classification.failures.map((f) => [f.test, f]));
    expect(byTest['queue full: the login POST is answered with HTTP 503']).toMatchObject({
      status: 'failed',
      classification: 'infrastructure/sut-unavailable',
      evidence: ['main document (POST) answered HTTP 503 Service Unavailable'],
    });
    expect(byTest['control: the login POST is answered with HTTP 200 and no error message']!.classification).toBe('assertion/mismatch');
    expect(byTest['control: a locator timeout on a healthy page']!.classification).toBe('automation/locator-timeout');
    // Only the MAIN-FRAME document counts: a 5xx image or iframe is not an outage of the page.
    expect(byTest['control: a healthy page whose image and iframe are answered with HTTP 503']!.classification).toBe('assertion/mismatch');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
