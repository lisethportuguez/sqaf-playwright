import { defineConfig } from '@playwright/test';

/**
 * Test support: isolated Playwright configuration that runs the synthetic
 * samples in ./allure-samples (no browser, no SUT) through the REAL failure
 * classification reporter and the REAL SQAF Allure reporter, in the order of
 * `npm run test:e2e:allure`, writing into a sandbox. Used by
 * tests/unit/reporting/allure-reporter.spec.ts (Stage 6, Phase 2).
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const sandbox = required('SAMPLE_SANDBOX');

export default defineConfig({
  testDir: './allure-samples',
  testMatch: '**/*.sample.ts',
  outputDir: `${sandbox}/test-results`,
  workers: 1,
  retries: 1,
  reporter: [
    ['../../../src/reporting/failure-classification-reporter.ts', { outputFile: `${sandbox}/reports/failure-classification.json` }],
    [
      '../../../src/reporting/allure-reporter.ts',
      {
        rawResultsDir: `${sandbox}/allure-results`,
        safeResultsDir: `${sandbox}/allure-results-safe`,
        reportDir: `${sandbox}/allure-report`,
        historyFile: `${sandbox}/allure-history/history.jsonl`,
        classificationFile: `${sandbox}/reports/failure-classification.json`,
        statusFile: `${sandbox}/reports/allure-status.json`,
        generate: process.env['SAMPLE_GENERATE'] !== '0',
      },
    ],
  ],
});
