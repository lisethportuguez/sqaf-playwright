import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { sqafEvidencePolicy } from '../../../config/evidence';
import { sqafConfig } from '../../../config';

/**
 * Static check of the CI step of the SQAF functional scenarios (Stage 4,
 * E4.5; ADR-0003 and ADR-0010 D9). The real behaviour on GitHub is recorded
 * only after a run on GitHub (docs/validation/E4-functional-scenarios.md §5).
 */

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const STEP_NAMES = [...WORKFLOW.matchAll(/\n      - name: (.+)/g)].map((match) => match[1]!.trim());
const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

const E2E = 'Functional scenarios (SQAF e2e)';
const run = (): string => stepBlock(E2E);

test.describe('when the functional scenarios run', () => {
  test('after the integration tests and their artifacts, as the last test step', () => {
    // The integration summary is uploaded BEFORE the e2e step writes reports/run-summary.json again.
    const order = ['Integration tests (Page Objects and fixtures)', 'Upload integration summary', 'Upload integration failure evidence', E2E, 'Upload e2e summary', 'Upload e2e failure evidence (product suites)'];
    const positions = order.map((name) => STEP_NAMES.indexOf(name));
    for (const [index, position] of positions.entries()) expect(position, order[index]).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    // Stage 6 (ADR-0011): the Allure report, its history and the fail-closed check follow (workflow-allure.spec.ts).
    expect(STEP_NAMES.slice(STEP_NAMES.indexOf('Upload e2e failure evidence (product suites)') + 1)).toEqual([
      'Upload Allure report',
      'Upload Allure history',
      'Check Allure pipeline',
    ]);
  });

  test('only if every previous step passed (no if: on the run step)', () => {
    expect(run()).not.toMatch(/^\s+if:/m);
  });

  test('the events are unchanged: push only to main, pull requests and manual runs', () => {
    expect(WORKFLOW).toMatch(/\n  push:\n    branches: \[main\]\n/);
    expect(WORKFLOW).toMatch(/\n  pull_request:\n    paths:\n/);
    expect(WORKFLOW).toMatch(/\n  workflow_dispatch:\n/);
    expect(WORKFLOW).not.toMatch(/\n  (schedule|pull_request_target|workflow_run):/);
  });
});

test.describe('selection, browser, workers and retries', () => {
  test('pull requests run @smoke; push to main and manual runs run the full suite', () => {
    expect(run()).toContain(`if [ "$GITHUB_EVENT_NAME" = "pull_request" ]; then SELECTION='--grep=@smoke'; else SELECTION=''; fi`);
    expect(run()).toContain('npm run test:e2e -- $SELECTION ');
    expect(run().match(/--grep/g)).toHaveLength(1);
  });

  test('Chromium only, through the npm script (no other browser is installed or selected)', () => {
    expect(PACKAGE.scripts['test:e2e']).toBe('playwright test --project=chromium');
    expect(WORKFLOW.match(/playwright install/g)).toHaveLength(1);
    expect(WORKFLOW).not.toMatch(/firefox|webkit/i);
  });

  test('workers and retries come from playwright.config.ts (CI: 1 worker, 2 retries), never from the step', () => {
    expect(run()).not.toMatch(/--(workers|retries|repeat-each|project|timeout|fully-parallel|max-failures)\b/);
    expect(sqafConfig.isCI).toBe(process.env['CI'] === 'true' || process.env['CI'] === '1');
  });

  test('the job and its timeout are unchanged', () => {
    expect(WORKFLOW).toMatch(/\n    name: Typecheck, unit, baseline and integration \(Chromium\)\n/);
    expect(WORKFLOW).toMatch(/\n    timeout-minutes: 20\n/);
  });
});

test.describe('evidence and security (ADR-0009 D16, INC-2026-11-16)', () => {
  test('the CLI reporters replace the configured ones: no HTML and no raw JSON report', () => {
    expect(run()).toContain('--reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts');
    expect(run()).not.toMatch(/\bhtml\b|\bjson\b|PLAYWRIGHT_(HTML|JSON)_OUTPUT/);
    // The classification reporter must come BEFORE the summary reporter, which reads its report.
    expect(run().indexOf('failure-classification-reporter.ts')).toBeLessThan(run().indexOf('run-summary-reporter.ts'));
    expect(run()).toContain('--output=test-results-e2e');
  });

  test('the e2e summary is the only e2e result artifact', () => {
    const block = stepBlock('Upload e2e summary');
    expect(block).toMatch(/^\s+path: reports\/run-summary\.json$/m);
    expect(block).toContain("if: ${{ !cancelled() && steps.e2e.outcome != 'skipped' }}");
    expect(block).toContain('if-no-files-found: error');
  });

  test('failure evidence is published ONLY for the product suites (no accounts, no forms)', () => {
    const block = stepBlock('Upload e2e failure evidence (product suites)');
    expect(block).toMatch(/^\s+path: test-results-e2e\/products-\*\/$/m);
    expect(block).not.toMatch(/authentication|checkout|reports\//);
    expect(block).toContain("if: ${{ failure() && steps.e2e.outcome == 'failure' }}");
    // No other step uploads e2e outputs.
    const uploads = WORKFLOW.split('\n      - name: ')
      .map((step) => step.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n'))
      .filter((step) => step.includes('upload-artifact'));
    expect(uploads.filter((step) => /e2e/.test(step))).toHaveLength(2);
    expect(WORKFLOW).not.toMatch(/playwright-report-e2e|e2e-results\.json/);
  });

  test('the general evidence policy still keeps no video outside CI and no trace without a failure', () => {
    expect(sqafEvidencePolicy(true)).toEqual({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' });
    expect(sqafConfig.credentialEvidence).toEqual({ trace: 'off', screenshot: 'only-on-failure', video: 'off' });
  });

  test('least privilege: read-only token, no secrets, no write permission', () => {
    // Stage 6 (ADR-0011): actions: read, only to download the Allure history of earlier runs (workflow-allure.spec.ts).
    expect(WORKFLOW).toMatch(/\npermissions:\n  contents: read\n  actions: read\n\n/);
    expect(WORKFLOW).not.toMatch(/secrets\.|write-all|: write\b|GITHUB_TOKEN/);
  });

  test('a running run is never cancelled, on pull requests or on main (accounts must reach their cleanup)', () => {
    expect(WORKFLOW).toContain('\nconcurrency:\n  group: ${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: false\n');
    expect(WORKFLOW.match(/cancel-in-progress/g)).toHaveLength(1);
    expect(WORKFLOW).not.toContain('\n    concurrency:'); // no job-level override
  });

  test('no step installs or changes dependencies or versions', () => {
    expect(WORKFLOW.match(/npm ci/g)).toHaveLength(1);
    expect(WORKFLOW).not.toMatch(/npm (install|i |update)|npx -y|@latest|playwright@/);
    expect(WORKFLOW).toContain('node-version-file: .nvmrc');
  });
});
