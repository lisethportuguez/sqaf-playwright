import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type TestInfo } from '@playwright/test';
import type { FullConfig, FullResult } from '@playwright/test/reporter';
import FailureClassificationReporter, {
  renderStepSummary,
  type FailureClassificationReport,
} from '../../../src/reporting/failure-classification-reporter';
import { readJson, runPlaywright } from '../support/run-playwright';

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
    byClassification: { 'infrastructure/anti-bot-challenge': 2, unclassified: 1 },
  });
  const byTest = Object.fromEntries(report.failures.map((f) => [f.test.split(' › ').at(-1), f]));
  expect(byTest['simulated baseline assertion on the challenge page']?.classification).toBe(
    'infrastructure/anti-bot-challenge',
  );
  expect(byTest['SQAF guard raises InfrastructureError on the challenge page']?.classification).toBe(
    'infrastructure/anti-bot-challenge',
  );
  expect(byTest['ordinary assertion failure']?.classification).toBe('unclassified');
  for (const failure of report.failures) {
    expect(failure.status).toBe('failed');
    expect(failure.file).not.toMatch(/^[A-Za-z]:|^\//); // relative paths only
  }

  // Console and GitHub job summary.
  expect(run.stdout).toContain('[SQAF] Failure classification: 3 failed attempt(s)');
  expect(run.stdout).toContain('2 infrastructure/anti-bot-challenge, 1 unclassified');
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
    schemaVersion: 1,
    generatedAt: '2026-11-15T00:00:00.000Z',
    runStatus: 'passed',
    projects: ['baseline'],
    note: 'n',
    totals: { failedAttempts: 0, byClassification: { 'infrastructure/anti-bot-challenge': 0, unclassified: 0 } },
    failures: [],
  });
  expect(markdown).toContain('### SQAF failure classification (baseline)');
  expect(markdown).toContain('No failed attempts.');
});
