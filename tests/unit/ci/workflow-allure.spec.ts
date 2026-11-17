import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Static contract of the Allure integration in CI (Stage 6, Phase 3;
 * ADR-0011 and ADR-0003). The pipeline itself (sanitize, scan, generate,
 * scan, fail-closed) is covered by tests/unit/reporting/allure-*.spec.ts.
 */
const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const STEP_NAMES = [...WORKFLOW.matchAll(/\n      - name: (.+)/g)].map((match) => match[1]!.trim());

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

const code = (block: string): string =>
  block
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

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

const UPLOADS = STEP_NAMES.filter((name) => stepBlock(name).includes('uses: actions/upload-artifact@'));
const INTEGRATION = 'Integration tests (Page Objects and fixtures)';
const E2E = 'Functional scenarios (SQAF e2e)';
const DOWNLOAD = 'Download Allure history (read-only)';
const REPORT = 'Upload Allure report';
const HISTORY = 'Upload Allure history';
const CHECK = 'Check Allure pipeline';
const REPORTERS =
  '--reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts,./src/reporting/allure-reporter.ts';

test.describe('least privilege and no GitHub Pages', () => {
  test('permissions are exactly contents: read and actions: read (to read earlier artifacts)', () => {
    expect(WORKFLOW).toContain('\npermissions:\n  contents: read\n  actions: read\n\n');
    expect(WORKFLOW.match(/permissions:/g)).toHaveLength(1);
    expect(WORKFLOW).not.toMatch(/:\s*write\b/);
  });

  test('nothing is deployed to GitHub Pages', () => {
    expect(code(WORKFLOW)).not.toMatch(/actions\/(?:deploy-pages|configure-pages|upload-pages-artifact)|^\s*pages:|gh-pages|github\.io/m);
  });
});

test.describe('generation in the existing steps', () => {
  test('integration and e2e add the Allure reporter LAST, after the classification it reads', () => {
    for (const name of [INTEGRATION, E2E]) {
      const run = code(stepBlock(name));
      expect(run, name).toContain(REPORTERS);
      expect(run.match(/--reporter=/g), name).toHaveLength(1);
    }
  });

  test('the step order is unchanged; the history is downloaded after the baseline and before the integration run', () => {
    const order = [
      'Typecheck',
      'Unit tests (framework)',
      'Install Chromium',
      'Run baseline',
      'Upload baseline classification',
      'Upload failure evidence',
      DOWNLOAD,
      INTEGRATION,
      'Upload integration summary',
      'Upload integration failure evidence',
      E2E,
      'Upload e2e summary',
      'Upload e2e failure evidence (product suites)',
      REPORT,
      HISTORY,
      CHECK,
    ];
    expect(STEP_NAMES.filter((name) => order.includes(name))).toEqual(order);
  });

  test('the baseline is untouched: no Allure in its step', () => {
    expect(stepBlock('Run baseline')).not.toMatch(/allure/i);
    expect(readFileSync('playwright.config.ts', 'utf8')).not.toMatch(/allure/i);
  });
});

test.describe('publication: only the scanned HTML report, never raw results', () => {
  test('no upload step publishes Allure results (raw or prepared) or anything else of Allure', () => {
    for (const name of UPLOADS) {
      for (const path of uploadPaths(stepBlock(name))) {
        expect(path, name).not.toMatch(/allure-results/);
        if (/allure/.test(path)) expect([REPORT, HISTORY], `${name}: ${path}`).toContain(name);
      }
    }
    expect(code(WORKFLOW)).not.toMatch(/allure-results/);
  });

  test('the report: only allure-report/, only if it exists (it is deleted on any finding), 14 days', () => {
    const block = stepBlock(REPORT);
    expect(uploadPaths(block)).toEqual(['allure-report/']);
    expect(block).toContain("if: ${{ !cancelled() && steps.integration.outcome != 'skipped' && hashFiles('allure-report/awesome/index.html') != '' }}");
    expect(block).toMatch(/name: allure-report-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
    expect(block).toContain('retention-days: 14');
    expect(block).toContain('if-no-files-found: error');
  });

  test('the history: written only by push runs on main, with a scanned report, 90 days', () => {
    const block = stepBlock(HISTORY);
    expect(uploadPaths(block)).toEqual(['allure-history/history.jsonl']);
    expect(block).toContain(
      "if: ${{ !cancelled() && steps.integration.outcome != 'skipped' && github.event_name == 'push' && github.ref == 'refs/heads/main' && hashFiles('allure-report/awesome/index.html') != '' }}",
    );
    expect(block).toMatch(/name: allure-history-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
    expect(block).toContain('retention-days: 90');
  });

  test('pull requests and manual runs read the history of main push runs and never write it', () => {
    const run = code(stepBlock(DOWNLOAD));
    expect(run).toContain('GH_TOKEN: ${{ github.token }}');
    expect(run).toContain('gh run list --repo "$GITHUB_REPOSITORY" --workflow ci.yml --branch main --event push --status completed');
    expect(run).toContain("--pattern 'allure-history-*'");
    expect(run).not.toMatch(/upload|gh (api|release|pr)|git push/);
    expect(run).not.toMatch(/^\s+if:/m); // only after the baseline passed, like the integration run
  });

  test('fail-closed: an unsafe or missing report fails the run, after the allowed uploads', () => {
    const block = stepBlock(CHECK);
    expect(STEP_NAMES.at(-1)).toBe(CHECK);
    expect(block).toContain("if: ${{ !cancelled() && steps.integration.outcome != 'skipped' }}");
    expect(block).toContain('test -f reports/allure-status.json');
    expect(block).toContain("if (!s.safe)");
  });
});
