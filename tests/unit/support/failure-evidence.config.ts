import { defineConfig } from '@playwright/test';

/**
 * Test support: isolated Playwright configuration that runs the synthetic
 * failing samples in ./failure-evidence (no browser, no SUT) with the
 * reporters of a CI unit run (list, HTML report and the REAL failure
 * classification reporter), writing into a sandbox laid out like the CI
 * workspace (`test-results/`, `playwright-report/`, `reports/`). Used by
 * tests/unit/ci/workflow-failure-evidence.spec.ts (Stage 4, E4.5 final closure).
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const sandbox = required('SAMPLE_SANDBOX');

export default defineConfig({
  testDir: './failure-evidence',
  testMatch: '**/*.sample.ts',
  outputDir: `${sandbox}/test-results`,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: `${sandbox}/playwright-report` }],
    ['../../../src/reporting/failure-classification-reporter.ts', { outputFile: `${sandbox}/reports/failure-classification.json` }],
  ],
});
