import { defineConfig } from '@playwright/test';

/**
 * Test support: isolated Playwright configuration that runs the synthetic
 * samples in ./summary-samples (no browser, no SUT) through the REAL failure
 * classification and run summary reporters, in the order used by CI. Used by
 * tests/unit/reporting/run-summary-reporter.spec.ts.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

export default defineConfig({
  testDir: './summary-samples',
  testMatch: '**/*.sample.ts',
  outputDir: required('SAMPLE_OUTPUT_DIR'),
  workers: 1,
  retries: 1,
  reporter: [
    ['../../../src/reporting/failure-classification-reporter.ts', { outputFile: required('SAMPLE_CLASSIFICATION') }],
    [
      '../../../src/reporting/run-summary-reporter.ts',
      { outputFile: required('SAMPLE_SUMMARY'), classificationFile: required('SAMPLE_CLASSIFICATION') },
    ],
  ],
});
