import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Static check of what the integration run of CI publishes (Stage 4, E4.5
 * security closure; ADR-0003 and ADR-0010 D12). The integration HTML report
 * showed the synthetic test-account e-mails in `Fill "…"` step titles and in
 * the cleanup attachments, so it is no longer generated in CI. The runtime
 * counterpart is tests/integration/security/integration-artifacts.spec.ts.
 */

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const STEP_NAMES = [...WORKFLOW.matchAll(/\n      - name: (.+)/g)].map((match) => match[1]!.trim());

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

/** Without comment lines. */
const code = (block: string): string =>
  block
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

const RUN = 'Integration tests (Page Objects and fixtures)';
const SUMMARY = 'Upload integration summary';
const EVIDENCE = 'Upload integration failure evidence';

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

/** Arguments of the integration run, the integration upload steps and every path they publish. */
function ciIntegrationRun(): { args: string[]; uploadSteps: string[]; publishedPaths: string[] } {
  const command = stepBlock(RUN)
    .split('\n')
    .find((line) => line.includes('npm run test:integration'));
  expect(command).toBeDefined();
  const args = command!.trim().replace(/^npm run test:integration\s*(--\s*)?/, '').split(/\s+/).filter(Boolean);
  const uploadSteps = [...WORKFLOW.matchAll(/\n      - name: (Upload integration[^\n]*)/g)].map((m) => m[1]!.trim());
  return { args, uploadSteps, publishedPaths: uploadSteps.flatMap((name) => uploadPaths(stepBlock(name))) };
}

/** actions/upload-artifact semantics for the forms ci.yml uses: `*` within a segment, a trailing `/` selects a directory. */
function globMatches(pattern: string, file: string): boolean {
  expect(pattern.startsWith('!'), `no exclusions are used: ${pattern}`).toBe(false);
  const directory = pattern.endsWith('/');
  const source = pattern
    .replace(/\/$/, '')
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${source}${directory ? '/.+' : ''}$`).test(file);
}

const published = (files: readonly string[], paths: readonly string[]): string[] =>
  files.filter((file) => paths.some((pattern) => globMatches(pattern, file)));

/** Integration spec files and the output-folder prefix Playwright derives from each (`pages/products.spec.ts` → `pages-products-`). */
const SPECS = (() => {
  const root = join('tests', 'integration');
  const out: Array<{ file: string; prefix: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith('.spec.ts')) {
        const rel = relative(root, path).replaceAll('\\', '/');
        out.push({ file: rel, prefix: `${rel.replace(/\.spec\.ts$/, '').replaceAll('/', '-')}-` });
      }
    }
  };
  walk(root);
  return out;
})();

/** Anything that handles accounts, e-mails, passwords or card data. */
const SENSITIVE_SOURCE = /testUser|newUserData|accountApi|CREDENTIAL_SAFE_EVIDENCE|credential|@example\.|fillSecret|\.login\(|startSignup|card[_-]?number|cardNumber|cvc|password|spawn\(/i;

test.describe('the integration run (E4.5 security closure)', () => {
  test('the CLI reporters replace the configured ones: no HTML and no raw JSON report', () => {
    const run = code(stepBlock(RUN));
    expect(run).toContain(
      'npm run test:integration -- --output=test-results-integration --reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts',
    );
    expect(run).not.toMatch(/\bhtml\b|\bjson\b|PLAYWRIGHT_(HTML|JSON)_OUTPUT/);
    expect(run.indexOf('failure-classification-reporter.ts')).toBeLessThan(run.indexOf('run-summary-reporter.ts'));
    expect(ciIntegrationRun().args).toEqual([
      '--output=test-results-integration',
      '--reporter=list,./src/reporting/failure-classification-reporter.ts,./src/reporting/run-summary-reporter.ts',
    ]);
  });

  test('no step publishes an HTML report or the raw outputs of the integration run', () => {
    expect(STEP_NAMES).not.toContain('Upload integration HTML report');
    expect(WORKFLOW).not.toMatch(/playwright-report-integration|integration-report-/);
    expect(ciIntegrationRun().uploadSteps).toEqual([SUMMARY, EVIDENCE]);
    for (const path of ciIntegrationRun().publishedPaths) {
      expect(path).not.toMatch(/^test-results-integration\/?$|^reports\/?$|failure-classification/);
    }
  });

  test('the safe summary is uploaded right after the run, before the e2e step writes its own', () => {
    const block = stepBlock(SUMMARY);
    expect(block).toMatch(/^\s+path: reports\/run-summary\.json$/m);
    expect(block).toContain("if: ${{ !cancelled() && steps.integration.outcome != 'skipped' }}");
    expect(block).toContain('if-no-files-found: error');
    expect(block).toMatch(/name: integration-summary-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
    expect(STEP_NAMES.indexOf(SUMMARY)).toBe(STEP_NAMES.indexOf(RUN) + 1);
    expect(STEP_NAMES.indexOf(SUMMARY)).toBeLessThan(STEP_NAMES.indexOf('Functional scenarios (SQAF e2e)'));
  });

  test('failure evidence: only folders of integration suites that never handle accounts, e-mails, passwords or cards', () => {
    const block = stepBlock(EVIDENCE);
    expect(block).toContain("if: ${{ failure() && steps.integration.outcome == 'failure' }}");
    const paths = ciIntegrationRun().publishedPaths.filter((path) => path !== 'reports/run-summary.json');
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path).toMatch(/^test-results-integration\/[a-z0-9-]+-\*\/$/);
      // Each path selects exactly one existing spec file…
      const prefix = path.slice('test-results-integration/'.length, -'*/'.length);
      const selected = SPECS.filter((spec) => spec.prefix === prefix);
      const overlapping = SPECS.filter((spec) => spec.prefix !== prefix && `${spec.prefix}x`.startsWith(prefix));
      expect(selected.map((s) => s.file), path).toHaveLength(1);
      expect(overlapping.map((s) => s.file), path).toEqual([]);
      // …whose source handles no sensitive data.
      const source = readFileSync(join('tests', 'integration', selected[0]!.file), 'utf8');
      expect(source, selected[0]!.file).not.toMatch(SENSITIVE_SOURCE);
    }
  });

  test('every integration suite that handles sensitive data is excluded', () => {
    const publishedPrefixes = ciIntegrationRun().publishedPaths.map((path) => path.slice('test-results-integration/'.length, -'*/'.length));
    const sensitive = SPECS.filter((spec) => SENSITIVE_SOURCE.test(readFileSync(join('tests', 'integration', spec.file), 'utf8')));
    expect(sensitive.map((s) => s.file)).toEqual(
      expect.arrayContaining(['data/account-api.spec.ts', 'pages/auth.spec.ts', 'pages/checkout-components.spec.ts', 'security/credential-evidence.spec.ts']),
    );
    for (const spec of sensitive) expect(publishedPrefixes, spec.file).not.toContain(spec.prefix);
    // Truncated folder names (Playwright keeps the first characters) still start with the prefix.
    const sample = `test-results-integration/data-account-api-the-account-client-creates-a-1b2c3-integration/test-failed-1.png`;
    expect(published([sample], ciIntegrationRun().publishedPaths)).toEqual([]);
  });

  test('globMatches follows the upload-artifact forms used by ci.yml', () => {
    expect(globMatches('test-results-integration/pages-products-*/', 'test-results-integration/pages-products-a-b-integration/trace.zip')).toBe(true);
    expect(globMatches('test-results-integration/pages-products-*/', 'test-results-integration/pages-product-components-a/x.png')).toBe(false);
    expect(globMatches('test-results-integration/pages-products-*/', 'test-results-integration/pages-products-a')).toBe(false);
    expect(globMatches('reports/run-summary.json', 'reports/run-summary.json')).toBe(true);
    expect(globMatches('reports/run-summary.json', 'reports/failure-classification.json')).toBe(false);
  });
});
