import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type TestInfo } from '@playwright/test';
import type { FullConfig, FullResult } from '@playwright/test/reporter';
import FailureClassificationReporter, {
  redactExcerpt,
  renderStepSummary,
  type FailureClassificationReport,
} from '../../../src/reporting/failure-classification-reporter';
import { emptyClassificationCounts } from '../../../src/errors/failure-classification';
import { readJson, runPlaywright } from '../support/run-playwright';
import type { TestCase, TestResult } from '@playwright/test/reporter';

/**
 * The reporter is exercised end to end: a child Playwright run executes four
 * synthetic samples (no browser, no SUT) through the REAL reporter, next to
 * Playwright's own JSON reporter, which is the independent source of truth
 * for statuses and exit code.
 */

interface JsonReport {
  stats: { expected: number; unexpected: number; flaky: number; skipped: number };
  suites: Array<{
    title: string;
    specs: Array<{ title: string; tests: Array<{ status: string; results: Array<{ status: string; retry: number }> }> }>;
  }>;
}

function runSamples(testInfo: TestInfo, retries: number) {
  const paths = {
    json: testInfo.outputPath('playwright.json'),
    classification: testInfo.outputPath('failure-classification.json'),
    summary: testInfo.outputPath('step-summary.md'),
  };
  const run = runPlaywright(['test', '--config=tests/unit/support/classification-samples.config.ts'], {
    SAMPLE_OUTPUT_DIR: testInfo.outputPath('sample-results'),
    SAMPLE_JSON: paths.json,
    SAMPLE_CLASSIFICATION: paths.classification,
    SAMPLE_RETRIES: String(retries),
    GITHUB_STEP_SUMMARY: paths.summary,
  });
  return { run, paths };
}

function resultsBySpec(json: JsonReport): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const suite of json.suites) {
    for (const spec of suite.specs) out[spec.title] = spec.tests.flatMap((t) => t.results.map((r) => r.status));
  }
  return out;
}

test('classifies failures without changing statuses or the exit code', async ({}, testInfo) => {
  const { run, paths } = runSamples(testInfo, 0);

  // The run still FAILS: 3 failing samples, exit code 1.
  expect(run.status, run.stderr).toBe(1);

  const json = readJson<JsonReport>(paths.json);
  expect(json.stats).toMatchObject({ expected: 1, unexpected: 3, flaky: 0, skipped: 0 });
  expect(resultsBySpec(json)).toEqual({
    'simulated baseline assertion on the challenge page': ['failed'],
    'SQAF guard raises InfrastructureError on the challenge page': ['failed'],
    'ordinary assertion failure': ['failed'],
    'passing test': ['passed'],
  });

  const report = readJson<FailureClassificationReport>(paths.classification);
  expect(report.runStatus).toBe('failed');
  expect(report.totals).toEqual({
    failedAttempts: 3,
    // Stage 5 taxonomy: the ordinary `expect(2).toBe(3)` sample is now assertion/mismatch.
    byClassification: { ...emptyClassificationCounts(), 'infrastructure/anti-bot-challenge': 2, 'assertion/mismatch': 1 },
  });
  const byTest = Object.fromEntries(report.failures.map((f) => [f.test.split(' › ').at(-1), f]));
  expect(byTest['simulated baseline assertion on the challenge page']?.classification).toBe(
    'infrastructure/anti-bot-challenge',
  );
  expect(byTest['SQAF guard raises InfrastructureError on the challenge page']?.classification).toBe(
    'infrastructure/anti-bot-challenge',
  );
  expect(byTest['ordinary assertion failure']?.classification).toBe('assertion/mismatch');
  for (const failure of report.failures) {
    expect(failure.status).toBe('failed');
    expect(failure.file).not.toMatch(/^[A-Za-z]:|^\//); // relative paths only
  }

  // Console and GitHub job summary.
  expect(run.stdout).toContain('[SQAF] Failure classification: 3 failed attempt(s)');
  expect(run.stdout).toContain('2 infrastructure/anti-bot-challenge, 1 assertion/mismatch');
  expect(run.stdout).not.toContain('0 infrastructure/network'); // only non-zero counts are printed
  const summary = readFileSync(paths.summary, 'utf8');
  expect(summary).toContain('### SQAF failure classification');
  expect(summary).toContain('| `infrastructure/anti-bot-challenge` | 2 |');
  expect(summary).toContain('retries and the exit code are not modified');
});

test('does not add or alter retries: each attempt is reported as it happened', async ({}, testInfo) => {
  const { run, paths } = runSamples(testInfo, 1);
  expect(run.status, run.stderr).toBe(1);

  const json = readJson<JsonReport>(paths.json);
  expect(json.stats.flaky).toBe(0);
  expect(json.stats.unexpected).toBe(3);
  // Exactly the configured retries (1), for infrastructure failures too: no special retry.
  expect(resultsBySpec(json)).toEqual({
    'simulated baseline assertion on the challenge page': ['failed', 'failed'],
    'SQAF guard raises InfrastructureError on the challenge page': ['failed', 'failed'],
    'ordinary assertion failure': ['failed', 'failed'],
    'passing test': ['passed'],
  });

  const report = readJson<FailureClassificationReport>(paths.classification);
  expect(report.totals.failedAttempts).toBe(6);
  expect(report.failures.map((f) => f.retry).sort()).toEqual([0, 0, 0, 1, 1, 1]);
});

test('onEnd returns nothing, so it can never override the run status', async ({}, testInfo) => {
  const outputFile = testInfo.outputPath('empty.json');
  const reporter = new FailureClassificationReporter({ outputFile });
  reporter.onBegin({ rootDir: process.cwd(), projects: [{ name: 'unit' }] } as unknown as FullConfig);
  const returned = reporter.onEnd({ status: 'failed' } as FullResult);
  expect(returned).toBeUndefined();
  expect(existsSync(outputFile)).toBe(true);
  const report = readJson<FailureClassificationReport>(outputFile);
  expect(report.runStatus).toBe('failed');
  expect(report.totals.failedAttempts).toBe(0);
  expect(report.note).toContain('not modified');
});

test('renders a job summary for a run without failures', () => {
  const markdown = renderStepSummary({
    schemaVersion: 2,
    generatedAt: '2026-11-15T00:00:00.000Z',
    runStatus: 'passed',
    projects: ['baseline'],
    note: 'n',
    totals: { failedAttempts: 0, byClassification: emptyClassificationCounts() },
    failures: [],
  });
  expect(markdown).toContain('### SQAF failure classification (baseline)');
  expect(markdown).toContain('No failed attempts.');
});

/*
 * INC-2026-11-16: the classification JSON is published by CI, and a failed
 * `fill(password)` prints the typed value in Playwright's call log. The
 * excerpt is redacted; the values below are fake and built at runtime.
 */
test.describe('errorExcerpt never contains typed values or generated passwords', () => {
  const secret = ['Sqaf', '#', 'b2c4e6f8-0a1b-4c3d-9e8f-7a6b5c4d3e2f'].join('');
  const generated = ['Sqaf', '#', 'Ab3_dE5-gH7iJ9kL'].join('');
  const typed = `typed-${Date.now().toString(36)}`;

  // Call log printed by Playwright 1.65 when fill fails after resolving the element (observed locally).
  const FILL_FAILURE = [
    'Error: locator.fill: Error: Element is not an <input>, <textarea> or [contenteditable] element',
    'Call log:',
    "  - waiting for locator('[data-qa=\"password\"]')",
    "    - locator resolved to <h2>Enter Account Information</h2>",
    `    - fill("${secret}")`,
    '  - attempting fill action',
  ].join('\n');

  test('fill, type and pressSequentially values are redacted', () => {
    const excerpt = redactExcerpt(
      [FILL_FAILURE, `  - type("${typed}")`, `  - pressSequentially('${typed}')`, `Fill "${typed}" locator('#x')`].join('\n'),
    );
    expect(excerpt).toContain('fill("[REDACTED]")');
    expect(excerpt).toContain('type("[REDACTED]")');
    expect(excerpt).toContain("pressSequentially('[REDACTED]')");
    expect(excerpt).toContain('Fill "[REDACTED]"');
    expect(excerpt).not.toContain(secret);
    expect(excerpt).not.toContain(typed);
  });

  test('generated passwords are redacted in full, also when longer than 16 characters', () => {
    const excerpt = redactExcerpt(`Expected: "${generated}"\nReceived: "${secret}"`);
    expect(excerpt).toBe('Expected: "[REDACTED]"\nReceived: "[REDACTED]"');
  });

  test('redaction happens before truncation: no partial value at the end of the excerpt', () => {
    const excerpt = redactExcerpt(`${'x'.repeat(380)} - fill("${secret}")`);
    expect(excerpt.length).toBeLessThanOrEqual(400);
    expect(excerpt).not.toContain(secret.slice(0, 12));
  });

  test('ordinary diagnostics are kept', () => {
    const message = "Error: expect(locator).toBeVisible() failed\n\nLocator: getByText('Account Created!')\nExpected: visible";
    expect(redactExcerpt(message)).toBe(message);
  });

  test('the final JSON contains no sensitive input value', async ({}, testInfo) => {
    const outputFile = testInfo.outputPath('redacted.json');
    const reporter = new FailureClassificationReporter({ outputFile });
    reporter.onBegin({ rootDir: process.cwd(), projects: [{ name: 'baseline' }] } as unknown as FullConfig);
    const fakeTest = {
      titlePath: () => ['', 'baseline', 'baseline.spec.ts', 'TC1 - Register User', 'registers a new user through the UI'],
      parent: { project: () => ({ name: 'baseline' }) },
      location: { file: `${process.cwd()}/baseline/baseline.spec.ts`, line: 1, column: 1 },
    } as unknown as TestCase;
    const fakeResult = {
      status: 'failed',
      retry: 0,
      errors: [{ message: FILL_FAILURE }, { message: `Expected: "${generated}"` }],
      attachments: [],
    } as unknown as TestResult;
    reporter.onTestEnd(fakeTest, fakeResult);
    reporter.onEnd({ status: 'failed' } as FullResult);

    const text = readFileSync(outputFile, 'utf8');
    expect(text).not.toContain(secret);
    expect(text).not.toContain(generated);
    const report = JSON.parse(text) as FailureClassificationReport;
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.errorExcerpt).toContain('fill("[REDACTED]")');
    // The classification itself is unchanged by the redaction.
    expect(report.failures[0]!.status).toBe('failed');
  });
});
