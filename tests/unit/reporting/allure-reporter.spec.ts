import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import { appendsHistory, buildSafeAllureReport, type AllureStatus } from '../../../src/reporting/allure-reporter';
import { CLASSIFICATION_LABEL, type AllureResult } from '../../../src/reporting/allure/prepare-results';
import { decodeEmbedded, scanPaths } from '../../../src/reporting/allure/scan-report';
import { readJson, runPlaywright } from '../support/run-playwright';

/**
 * Stage 6, Phase 2 (ADR-0011) — the SQAF Allure pipeline end to end: a child
 * Playwright run executes the synthetic samples (no browser, no SUT) through
 * the REAL failure classification reporter, the REAL allure-playwright
 * reporter (wrapped by SQAF) and the REAL `allure generate`. The raw results
 * DO contain the fictitious secrets (control); the safe results, the report
 * and the history must not.
 */
test.describe.configure({ timeout: 240_000 });

const DATA_ID = ['user', 'zz00zz00', 'abcdef01', '7'].join('-');

function runSamples(testInfo: TestInfo, sandbox = testInfo.outputPath('sandbox')) {
  // No --reporter: it would replace the reporters of the sample configuration.
  const run = runPlaywright(['test', '--config=tests/unit/support/allure-samples.config.ts'], { SAMPLE_SANDBOX: sandbox });
  return { run, sandbox };
}

/** Every text of a report page: the shell and each decoded embedded entry. */
function reportTexts(file: string): string[] {
  const { shell, entries } = decodeEmbedded(readFileSync(file, 'utf8'));
  return [shell, ...entries.map((e) => e.text)];
}

test('raw results hold the secrets; the safe results, the report and the history do not', async ({}, testInfo) => {
  const { run, sandbox } = runSamples(testInfo);
  expect(run.status, run.stderr).toBe(1); // the samples fail on purpose: statuses and exit code are untouched
  expect(run.stdout).toContain('[SQAF] Allure report:');

  // Control: allure-playwright alone would publish all of this.
  const raw = scanPaths([join(sandbox, 'allure-results')], { rootDir: sandbox }).map((l) => l.detector);
  expect(raw).toEqual(expect.arrayContaining(['email', 'data-id', 'test-data-annotation', 'user-path']));

  expect(scanPaths([join(sandbox, 'allure-results-safe'), join(sandbox, 'allure-report'), join(sandbox, 'allure-history')], { rootDir: sandbox })).toEqual([]);

  const page = join(sandbox, 'allure-report', 'awesome', 'index.html');
  expect(existsSync(page)).toBe(true);
  const texts = reportTexts(page).join('\n');
  expect(texts).toContain('TC9: Search Product'); // the scanner really sees the decoded data
  expect(texts).toContain('Fill \\"[REDACTED]\\"');
  for (const secret of [DATA_ID, 'sqaf-account-cleanup', 'sqaf-test-data']) expect(texts, secret).not.toContain(secret);
  expect(readFileSync(join(sandbox, 'allure-history', 'history.jsonl'), 'utf8').trim().split('\n')).toHaveLength(1);
});

test('the SQAF classification of every failed attempt is preserved', async ({}, testInfo) => {
  const { sandbox } = runSamples(testInfo);
  const report = readJson<{ failures: Array<{ test: string; retry: number; classification: string }> }>(join(sandbox, 'reports', 'failure-classification.json'));
  const safeDir = join(sandbox, 'allure-results-safe');
  const results = readdirSync(safeDir)
    .filter((file) => file.endsWith('-result.json'))
    .map((file) => readJson<AllureResult>(join(safeDir, file)));
  const classified = results
    .flatMap((r) => (r.labels ?? []).filter((l) => l.name === CLASSIFICATION_LABEL).map((l) => `${r.name}: ${l.value}`))
    .sort();
  expect(classified).toEqual(report.failures.map((f) => `${f.test.split(' › ').at(-1)}: ${f.classification}`).sort());
  expect(classified).toHaveLength(3);
  // No attachment of the samples is allowlisted: screenshot, cleanup record, error contexts and console output are all dropped.
  expect(readdirSync(safeDir).filter((file) => !file.endsWith('-result.json'))).toEqual(['environment.properties']);
});

test('every report appends one history entry', async ({}, testInfo) => {
  const sandbox = testInfo.outputPath('sandbox');
  runSamples(testInfo, sandbox);
  runSamples(testInfo, sandbox);
  expect(readFileSync(join(sandbox, 'allure-history', 'history.jsonl'), 'utf8').trim().split('\n')).toHaveLength(2);
});

test('the status file holds the outcome without any value', async ({}, testInfo) => {
  const { sandbox } = runSamples(testInfo);
  const status = readJson<AllureStatus>(join(sandbox, 'reports', 'allure-status.json'));
  expect(status).toMatchObject({ schemaVersion: 1, status: 'generated', safe: true, results: 6, classified: 3, historyAppended: true, findings: [] });
  expect(scanPaths([join(sandbox, 'reports', 'allure-status.json')], { rootDir: sandbox })).toEqual([]);
});

test('one history entry per complete run: an integration-only run does not append', async ({}, testInfo) => {
  expect(appendsHistory(['integration'])).toBe(false);
  expect(appendsHistory(['integration', 'chromium'])).toBe(true);
  expect(appendsHistory(['chromium'])).toBe(true);

  const dirs = {
    safeResultsDir: testInfo.outputPath('allure-results-safe'),
    reportDir: testInfo.outputPath('allure-report'),
    historyFile: testInfo.outputPath('allure-history', 'history.jsonl'),
    classificationFile: testInfo.outputPath('missing-classification.json'),
  };
  const lines = (): number => (existsSync(dirs.historyFile) ? readFileSync(dirs.historyFile, 'utf8').trim().split('\n').filter(Boolean).length : 0);

  writeRawResult(testInfo.outputPath('raw-integration'), 'integration', 'tests/integration/pages/cart.spec.ts › removes a line');
  const integration = buildSafeAllureReport({ ...dirs, rawResultsDir: testInfo.outputPath('raw-integration') });
  expect(integration).toMatchObject({ status: 'generated', historyAppended: false });
  expect(lines()).toBe(0);

  writeRawResult(testInfo.outputPath('raw-e2e'));
  const e2e = buildSafeAllureReport({ ...dirs, rawResultsDir: testInfo.outputPath('raw-e2e') });
  expect(e2e).toMatchObject({ status: 'generated', historyAppended: true });
  expect(lines()).toBe(1);
  // The e2e report combines both suites: the integration results prepared before are kept.
  expect(e2e.prepared.projects).toEqual(['chromium']);
  expect(readdirSync(dirs.safeResultsDir).filter((f) => f.endsWith('-result.json')).sort()).toEqual(['chromium--r1-result.json', 'integration--r1-result.json']);
});

/** One prepared-ready raw result (allure-playwright shape) for the pipeline tests. */
function writeRawResult(
  dir: string,
  project = 'chromium',
  fullName = 'tests/e2e/products/tc08-verify-all-products-and-detail.spec.ts › TC8: Verify All Products and product detail page',
): void {
  mkdirSync(dir, { recursive: true });
  const result = {
    uuid: 'r1',
    historyId: 'h1',
    testCaseId: 'c1',
    name: fullName.split(' › ').at(-1),
    fullName,
    status: 'passed',
    stage: 'finished',
    start: 1_000,
    stop: 2_000,
    statusDetails: {},
    steps: [{ name: 'Open the home page', status: 'passed', stage: 'finished', start: 1_100, stop: 1_200, steps: [], attachments: [], parameters: [] }],
    attachments: [],
    parameters: [{ name: 'Project', value: project }],
    labels: [{ name: 'tag', value: 'regression' }],
    links: [],
  };
  writeFileSync(join(dir, 'r1-result.json'), JSON.stringify(result));
}

test('fail-closed: an unsafe generated report is deleted and the history restored', async ({}, testInfo) => {
  const dirs = {
    rawResultsDir: testInfo.outputPath('allure-results'),
    safeResultsDir: testInfo.outputPath('allure-results-safe'),
    reportDir: testInfo.outputPath('allure-report'),
    historyFile: testInfo.outputPath('allure-history', 'history.jsonl'),
    classificationFile: testInfo.outputPath('missing-classification.json'),
  };
  writeRawResult(dirs.rawResultsDir);

  const first = buildSafeAllureReport(dirs);
  expect(first.status).toBe('generated');
  const history = readFileSync(dirs.historyFile, 'utf8');

  // A configuration that writes an e-mail into the report and its history (built at runtime).
  const leakyConfig = testInfo.outputPath('leaky-allurerc.mjs');
  const address = ['sqaf.', DATA_ID, '@', 'example.com'].join('');
  writeFileSync(
    leakyConfig,
    `export default { name: ${JSON.stringify(address)}, historyPath: process.env.SQAF_ALLURE_HISTORY_FILE, appendHistory: true,` +
      ` plugins: { awesome: { options: { singleFile: true, reportName: ${JSON.stringify(address)} } } } };\n`,
  );
  const blocked = buildSafeAllureReport({ ...dirs, configFile: leakyConfig });
  expect(blocked.status).toBe('blocked-report');
  if (blocked.status === 'blocked-report') expect(blocked.leaks.map((l) => l.detector)).toContain('email');
  expect(existsSync(dirs.reportDir)).toBe(false);
  expect(readFileSync(dirs.historyFile, 'utf8')).toBe(history);
});

// The blocked-results path (unsafe prepared output) is covered in allure-prepare-results.spec.ts.
test('generate: false only prepares the safe results', async ({}, testInfo) => {
  const raw = testInfo.outputPath('allure-results');
  writeRawResult(raw);
  const outcome = buildSafeAllureReport({
    rawResultsDir: raw,
    safeResultsDir: testInfo.outputPath('safe'),
    reportDir: testInfo.outputPath('report'),
    historyFile: testInfo.outputPath('history', 'history.jsonl'),
    generate: false,
  });
  expect(outcome.status).toBe('prepared');
  expect(existsSync(testInfo.outputPath('report'))).toBe(false);
});
