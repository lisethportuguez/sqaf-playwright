import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Static check of the CI steps (ADR-0003, Stage 2): the pipeline runs
 * typecheck, unit tests, baseline and integration IN THIS ORDER, the
 * integration run keeps its own outputs, and only Chromium is installed.
 */

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const STEP_NAMES = [...WORKFLOW.matchAll(/\n      - name: (.+)/g)].map((match) => match[1]!.trim());

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

test('typecheck, unit tests, baseline and integration run in this order', () => {
  const order = ['Typecheck', 'Unit tests (framework)', 'Run baseline', 'Integration tests (Page Objects and fixtures)'];
  const positions = order.map((name) => STEP_NAMES.indexOf(name));
  for (const [index, position] of positions.entries()) expect(position, order[index]).toBeGreaterThan(-1);
  expect([...positions].sort((a, b) => a - b)).toEqual(positions);
});

test('the baseline evidence is uploaded before the integration run starts', () => {
  const integration = STEP_NAMES.indexOf('Integration tests (Page Objects and fixtures)');
  // INC-2026-11-16: the baseline publishes its classification JSON, not its HTML report.
  expect(STEP_NAMES.indexOf('Upload baseline classification')).toBeGreaterThan(-1);
  expect(STEP_NAMES.indexOf('Upload baseline classification')).toBeLessThan(integration);
  expect(STEP_NAMES.indexOf('Upload failure evidence')).toBeLessThan(integration);
});

test('the baseline step is unchanged apart from its summary heading', () => {
  expect(stepBlock('Run baseline')).toContain('npm run test:baseline');
  expect(stepBlock('Run baseline')).not.toMatch(/--(workers|retries|project|output)/);
});

test('the integration run has separate outputs and artifacts', () => {
  const run = stepBlock('Integration tests (Page Objects and fixtures)');
  expect(run).toContain('npm run test:integration -- --output=test-results-integration');
  expect(run).toContain('PLAYWRIGHT_HTML_OUTPUT_DIR: playwright-report-integration');
  expect(run).not.toMatch(/--(workers|retries)/);
  expect(stepBlock('Upload integration HTML report')).toContain('path: playwright-report-integration/');
  expect(stepBlock('Upload integration failure evidence')).toContain('test-results-integration/');
});

test('only Chromium is installed (no Firefox or WebKit runs in Stage 2)', () => {
  expect(stepBlock('Install Chromium')).toMatch(/^\s+run: npx playwright install --with-deps chromium$/m);
  expect(WORKFLOW.match(/playwright install/g)).toHaveLength(1);
  expect(WORKFLOW).not.toMatch(/--project=(firefox|webkit|chromium)/);
});

/*
 * INC-2026-11-16 (docs/security): the baseline HTML report records typed
 * values (the TC1 password) and must never be published. The baseline itself
 * keeps running exactly as before.
 */
test.describe('baseline credentials are never published (INC-2026-11-16)', () => {
  test('no step publishes the baseline HTML report (playwright-report/)', () => {
    expect(WORKFLOW).not.toMatch(/(?:^|[\s|:])playwright-report\/?\s*$/m);
    expect(STEP_NAMES).not.toContain('Upload HTML report');
  });

  test('the baseline publishes ONLY its failure classification JSON', () => {
    const block = stepBlock('Upload baseline classification');
    expect(block).toContain('uses: actions/upload-artifact@v4');
    expect(block).toMatch(/^\s+path: reports\/failure-classification\.json$/m);
    expect(block).toContain("if: ${{ !cancelled() }}");
    expect(block).toContain('if-no-files-found: error');
  });

  test('the failure evidence excludes the baseline outputs', () => {
    const block = stepBlock('Upload failure evidence');
    expect(block).toMatch(/^\s+test-results\/$/m);
    expect(block).toMatch(/^\s+!test-results\/\*-baseline\/\*\*$/m);
  });

  test('the baseline run step is exactly the Stage 1 step', () => {
    const block = stepBlock('Run baseline').split('\n\n')[0];
    expect(block).toBe(
      [
        '      - name: Run baseline',
        '        run: |',
        "          echo '## Baseline (Stage 0 conditions)' >> \"$GITHUB_STEP_SUMMARY\"",
        '          npm run test:baseline',
      ].join('\n'),
    );
  });

  test('the integration HTML report and its failure evidence are still published', () => {
    expect(stepBlock('Upload integration HTML report')).toContain('path: playwright-report-integration/');
    expect(stepBlock('Upload integration failure evidence')).toContain('test-results-integration/');
  });
});
