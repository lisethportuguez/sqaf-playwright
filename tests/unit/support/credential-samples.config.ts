import { defineConfig, devices } from '@playwright/test';
import { sqafEvidencePolicy } from '../../../config/evidence';
import { SQAF_LOCATORS } from '../../../config/locators';

/**
 * Test support: isolated Playwright configuration that runs the samples in
 * ./credential-samples against a FAKE SUT served by
 * tests/integration/security/credential-evidence.spec.ts (never the real SUT).
 *
 * It applies the GENERAL evidence policy of the integration project in CI
 * (trace and video retained on failure): the samples prove that the
 * credential fixtures override it safely, or refuse to run.
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const ci = sqafEvidencePolicy(true);

export default defineConfig({
  testDir: './credential-samples',
  testMatch: '**/*.sample.ts',
  outputDir: required('SAMPLE_OUTPUT_DIR'),
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 2_000 },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: required('SAMPLE_HTML_DIR') }],
    ['json', { outputFile: required('SAMPLE_JSON') }],
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
