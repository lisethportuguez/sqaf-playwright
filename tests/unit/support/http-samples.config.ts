import { defineConfig, devices } from '@playwright/test';
import { sqafEvidencePolicy } from '../../../config/evidence';
import { SQAF_LOCATORS } from '../../../config/locators';

/**
 * Test support: isolated Playwright configuration that runs ./http-samples
 * against a FAKE SUT served by tests/integration/reporting/http-evidence.spec.ts
 * (never the real SUT), through the REAL failure classification reporter.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const ci = sqafEvidencePolicy(true);

export default defineConfig({
  testDir: './http-samples',
  testMatch: '**/*.sample.ts',
  outputDir: required('SAMPLE_OUTPUT_DIR'),
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 2_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: required('SAMPLE_JSON') }],
    ['../../../src/reporting/failure-classification-reporter.ts', { outputFile: required('SAMPLE_CLASSIFICATION') }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: required('SAMPLE_BASE_URL'),
    actionTimeout: 2_000,
    trace: ci.trace,
    screenshot: ci.screenshot,
    video: ci.video,
    testIdAttribute: SQAF_LOCATORS.testIdAttribute,
  },
});
