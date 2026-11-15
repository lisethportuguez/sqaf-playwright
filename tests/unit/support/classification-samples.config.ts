import { defineConfig } from '@playwright/test';

/**
 * Test support: isolated Playwright configuration that runs the synthetic
 * samples in ./samples (no browser, no SUT) through the REAL failure
 * classification reporter. Used by
 * tests/unit/reporting/failure-classification-reporter.spec.ts.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

export default defineConfig({
  testDir: './samples',
  testMatch: '**/*.sample.ts',
  outputDir: required('SAMPLE_OUTPUT_DIR'),
  workers: 1,
  retries: Number(process.env['SAMPLE_RETRIES'] ?? '0'),
  reporter: [
    ['json', { outputFile: required('SAMPLE_JSON') }],
    ['../../../src/reporting/failure-classification-reporter.ts', { outputFile: required('SAMPLE_CLASSIFICATION') }],
  ],
});
