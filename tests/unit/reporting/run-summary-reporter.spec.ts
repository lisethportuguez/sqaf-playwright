import { readFileSync } from 'node:fs';
import { expect, test, type TestInfo } from '@playwright/test';
import {
  catalogTags,
  cliGrep,
  renderRunSummary,
  sanitizeSummaryText,
  summaryHeading,
  type RunSummary,
} from '../../../src/reporting/run-summary-reporter';
import { readJson, runPlaywright } from '../support/run-playwright';

/**
 * Stage 4 (E4.5) — safe run summary reporter, end to end: a child Playwright
 * run executes the synthetic samples (no browser, no SUT) through the REAL
 * classification and summary reporters, in the order used by CI.
 */

function runSamples(testInfo: TestInfo, extraArgs: readonly string[] = []) {
  const paths = {
    classification: testInfo.outputPath('failure-classification.json'),
    summary: testInfo.outputPath('run-summary.json'),
    stepSummary: testInfo.outputPath('step-summary.md'),
  };
  const run = runPlaywright(['test', '--config=tests/unit/support/summary-samples.config.ts', ...extraArgs], {
    SAMPLE_OUTPUT_DIR: testInfo.outputPath('sample-results'),
    SAMPLE_CLASSIFICATION: paths.classification,
    SAMPLE_SUMMARY: paths.summary,
    GITHUB_STEP_SUMMARY: paths.stepSummary,
  });
  return { run, paths };
}

test('reports every outcome, keeps flaky tests visible and reads the classification of each failed attempt', async ({}, testInfo) => {
  const { run, paths } = runSamples(testInfo);
  expect(run.status, run.stderr).toBe(1); // the run still fails: statuses and exit code are untouched

  const summary = readJson<RunSummary>(paths.summary);
  expect(summary.selection).toBe('all');
  expect(summary.workers).toBe(1);
  expect(summary.retries).toEqual([1]);
  expect(summary.totals).toMatchObject({ tests: 4, expected: 2, unexpected: 1, flaky: 1, skipped: 0, failedAttempts: 3 });
  expect(summary.totals.byClassification).toEqual({ 'infrastructure/sut-unavailable': 2, 'assertion/mismatch': 1 });

  const byTitle = Object.fromEntries(summary.tests.map((t) => [t.title.replace(/^.*› /, ''), t]));
  expect(byTitle['is flaky: fails on the first attempt only']).toMatchObject({
    outcome: 'flaky',
    attempts: [
      { retry: 0, status: 'failed', classification: 'assertion/mismatch' },
      { retry: 1, status: 'passed' },
    ],
  });
  const sut = byTitle['fails with an SUT error @smoke']!;
  expect(sut.outcome).toBe('unexpected');
  expect(sut.tags).toEqual(['@smoke']);
  expect(sut.attempts.map((a) => [a.retry, a.classification, a.evidence])).toEqual([
    [0, 'infrastructure/sut-unavailable', ['error raised as [SQAF:infrastructure/sut-unavailable]']],
    [1, 'infrastructure/sut-unavailable', ['error raised as [SQAF:infrastructure/sut-unavailable]']],
  ]);
});

test('never writes error messages, e-mails or secrets, neither in the JSON nor in the job summary', async ({}, testInfo) => {
  const { run, paths } = runSamples(testInfo);
  // Stage 4 (E4.5): the classification report and the console redact e-mails too, with no data id.
  expect(readFileSync(paths.classification, 'utf8')).toContain('[e-mail redacted]');
  // The console prints the SQAF error message redacted (the sample builds the e-mail at runtime, so no code frame shows it).
  const consoleOutput = run.stdout + run.stderr;
  expect(consoleOutput).toContain('The SUT answered HTTP 503 for [e-mail redacted]');
  expect(consoleOutput).not.toMatch(/user-sample-d/);
  expect(consoleOutput).not.toMatch(/Sqaf#x{16}/);

  for (const file of [paths.classification, paths.summary, paths.stepSummary]) {
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toContain('@example.com');
    expect(text, file).not.toMatch(/user-sample-d/);
    expect(text, file).not.toMatch(/Sqaf#x{16}/);
  }
  for (const file of [paths.summary, paths.stepSummary]) {
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toContain('HTTP 503 for');
    expect(text, file).not.toContain('first attempt fails');
    // E4.5 security closure: the published summary keeps no account data id either.
    expect(text, file).not.toMatch(/user-sample-\d/);
  }
  const summary = readJson<RunSummary>(paths.summary);
  expect(summary.tests.map((t) => t.title)).toContainEqual(expect.stringContaining('title with an e-mail [e-mail redacted]'));
});

test('the job summary shows the totals, the classifications and the flaky test', async ({}, testInfo) => {
  const { paths } = runSamples(testInfo);
  const markdown = readFileSync(paths.stepSummary, 'utf8');
  expect(markdown).toContain('### SQAF functional scenarios');
  expect(markdown).toContain('| 4 | 2 | 1 | 1 | 0 | 3 |');
  expect(markdown).toContain('| `infrastructure/sut-unavailable` | 2 |');
  expect(markdown).toMatch(/is flaky: fails on the first attempt only \| flaky \| 2 \|/);
  // The classification reporter wrote its own table first (reporter order).
  expect(markdown.indexOf('SQAF failure classification')).toBeLessThan(markdown.indexOf('SQAF functional scenarios'));
});

test('a --grep selection is recorded (the @smoke run of pull requests)', async ({}, testInfo) => {
  const { paths } = runSamples(testInfo, ['--grep=@smoke']);
  const summary = readJson<RunSummary>(paths.summary);
  expect(summary.selection).toBe('@smoke');
  expect(summary.totals.tests).toBe(2);
  expect(summary.tests.every((t) => t.tags.includes('@smoke'))).toBe(true);
});

test('sanitizeSummaryText and renderRunSummary (pure)', () => {
  // No data id of a SQAF address either: the address can be rebuilt from it.
  expect(sanitizeSummaryText('a sqaf.u-1@example.com b password=hunter22 c')).toBe('a [e-mail redacted] b password=[REDACTED] c');
  expect(summaryHeading(['integration'])).toBe('SQAF integration tests');
  expect(summaryHeading(['chromium'])).toBe('SQAF functional scenarios');
  expect(summaryHeading([])).toBe('SQAF functional scenarios');
  const markdown = renderRunSummary({
    schemaVersion: 1,
    generatedAt: '2026-11-16T00:00:00.000Z',
    runStatus: 'passed',
    durationMs: 1500,
    projects: ['chromium'],
    selection: 'all',
    workers: 1,
    retries: [2],
    totals: { tests: 1, expected: 1, unexpected: 0, flaky: 0, skipped: 0, failedAttempts: 0, byClassification: {} },
    tests: [{ title: 'a | b', tags: [], outcome: 'expected', attempts: [{ retry: 0, status: 'passed', durationMs: 1500 }] }],
    note: 'n',
  });
  expect(markdown).toContain('| a \\| b | expected | 1 | 1.5 s | — |');
  expect(markdown).not.toContain('| Classification |');
});

test('cliGrep reads --grep=, --grep and -g; catalogTags keeps only SQAF tags, once', () => {
  expect(cliGrep(['node', 'cli.js', 'test', '--grep=@smoke'])).toBe('@smoke');
  expect(cliGrep(['node', 'cli.js', 'test', '--grep', '@smoke'])).toBe('@smoke');
  expect(cliGrep(['node', 'cli.js', 'test', '-g', 'TC1:'])).toBe('TC1:');
  expect(cliGrep(['node', 'cli.js', 'test', '--project=chromium'])).toBeUndefined();
  expect(catalogTags(['@regression', '@smoke', '@smoke', '@example.com', 'x'])).toEqual(['@regression', '@smoke']);
});
