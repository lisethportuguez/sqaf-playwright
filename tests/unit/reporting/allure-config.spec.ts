import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { SQAF_ALLURE } from '../../../config';
import { FAILURE_CLASSIFICATIONS } from '../../../src/errors/classifications';
import SqafAllureReporter from '../../../src/reporting/allure-reporter';

/**
 * Stage 6, Phase 2 (ADR-0011) — static contract of the Allure integration:
 * configuration, dependencies, scripts, ignored outputs, and what does NOT
 * change (the configured reporters, the baseline and the CI workflow).
 */
interface AllureRc {
  readonly historyPath: string;
  readonly appendHistory: boolean;
  readonly categories: { readonly rules: ReadonlyArray<{ name: string; matchers: { labels: Record<string, RegExp> }; groupBy: unknown[] }> };
  readonly plugins: Record<string, { options: Record<string, unknown> }>;
}

const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; devDependencies: Record<string, string> };
const LOCK = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version: string }> };
const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');

async function allureRc(): Promise<AllureRc> {
  return ((await import(pathToFileURL(resolve('allurerc.mjs')).href)) as { default: AllureRc }).default;
}

test('exact versions of allure-playwright 3.14.0 and allure 3.22.1, locked with the project Playwright', () => {
  expect(PACKAGE.devDependencies['allure-playwright']).toBe('3.14.0');
  expect(PACKAGE.devDependencies['allure']).toBe('3.22.1');
  expect(LOCK.packages['node_modules/allure-playwright']!.version).toBe('3.14.0');
  expect(LOCK.packages['node_modules/allure']!.version).toBe('3.22.1');
  // allure-playwright reuses the project's @playwright/test: no second copy.
  expect(Object.keys(LOCK.packages).filter((key) => key.endsWith('node_modules/@playwright/test'))).toEqual(['node_modules/@playwright/test']);
});

test('Allure categories cover every SQAF classification and group by it', async () => {
  const rc = await allureRc();
  const rules = rc.categories.rules;
  for (const classification of [...FAILURE_CLASSIFICATIONS, 'not classified']) {
    const matching = rules.filter((rule) => rule.matchers.labels['sqaf.classification']!.test(classification));
    expect(matching, classification).toHaveLength(1);
  }
  for (const rule of rules) expect(rule.groupBy).toEqual([{ label: 'sqaf.classification' }]);
});

test('single-file report grouped by suite, module and scenario, with appended history', async () => {
  const rc = await allureRc();
  expect(rc.plugins['awesome']!.options).toMatchObject({ singleFile: true, groupBy: ['parentSuite', 'suite', 'subSuite'] });
  expect(rc.plugins['dashboard']!.options).toMatchObject({ singleFile: true });
  expect(rc.appendHistory).toBe(process.env['SQAF_ALLURE_APPEND_HISTORY'] !== '0');
  expect(rc.historyPath).toBe(process.env['SQAF_ALLURE_HISTORY_FILE'] ?? './allure-history/history.jsonl');
  expect(`./${SQAF_ALLURE.historyFile}`).toBe('./allure-history/history.jsonl');
});

test('the SQAF reporter runs allure-playwright with detail: false and raw results apart from the safe ones', () => {
  const reporter = new SqafAllureReporter({ rawResultsDir: test.info().outputPath('raw'), generate: false });
  const options = (reporter as unknown as { options: { detail: boolean; resultsDir: string } }).options;
  expect(options.detail).toBe(false); // never Playwright's `Fill "<value>"` action steps
  expect(options.resultsDir).toBe(test.info().outputPath('raw'));
  expect(SQAF_ALLURE.rawResultsDir).not.toBe(SQAF_ALLURE.safeResultsDir);
});

test('the Allure scripts add the reporter AFTER the classification reporter (it reads the classification)', () => {
  for (const [name, projects] of [['test:e2e:allure', ['chromium']], ['test:integration:allure', ['integration']], ['test:allure', ['integration', 'chromium']]] as const) {
    const script = PACKAGE.scripts[name]!;
    expect([...script.matchAll(/--project=(\S+)/g)].map((m) => m[1])).toEqual(projects);
    const reporters = /--reporter=(\S+)/.exec(script)![1]!.split(',');
    expect(reporters).toEqual(['list', './src/reporting/failure-classification-reporter.ts', './src/reporting/run-summary-reporter.ts', './src/reporting/allure-reporter.ts']);
  }
  // Served on this machine only (allure open listens on every interface by default).
  expect(PACKAGE.scripts['report:allure']).toBe('allure open allure-report --host 127.0.0.1');
  // The existing scripts do not change.
  expect(PACKAGE.scripts['test:e2e']).toBe('playwright test --project=chromium');
  expect(PACKAGE.scripts['test:baseline']).toBe('playwright test --project=baseline');
});

test('raw and safe results, report and history are never versioned', () => {
  const ignored = readFileSync('.gitignore', 'utf8').split(/\r?\n/);
  for (const dir of ['/allure-results/', '/allure-results-safe/', '/allure-results-safe.staging/', '/allure-report/', '/allure-history/']) {
    expect(ignored, dir).toContain(dir);
  }
});

test('Allure is not a configured reporter: the baseline and the existing runs keep their reporters', () => {
  const config = readFileSync('playwright.config.ts', 'utf8');
  expect(config).not.toMatch(/allure/i);
});

/**
 * The screenshot allowlist is the same as the failure evidence that CI
 * already publishes (suites without accounts, e-mails, passwords or cards).
 * Upload globs `test-results-<suite>/<dir>-<file>-*\/` map to spec files.
 */
test('the screenshot allowlist matches the failure evidence published by CI', () => {
  const globs = [...WORKFLOW.matchAll(/^\s+(?:path:\s+)?(test-results-(?:integration|e2e)\/[a-z-]+-\*\/)$/gm)].map((m) => m[1]!);
  expect(globs).toHaveLength(SQAF_ALLURE.screenshotSuites.length);
  const fromCi = globs.map((glob) => {
    if (glob === 'test-results-e2e/products-*/') return 'tests/e2e/products/';
    const [, dir, file] = /^test-results-integration\/(pages|fixtures)-([a-z-]+)-\*\/$/.exec(glob)!;
    return `tests/integration/${dir}/${file}.spec.ts`;
  });
  expect([...fromCi].sort()).toEqual([...SQAF_ALLURE.screenshotSuites].sort());
});
