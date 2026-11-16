import { defineConfig, devices } from '@playwright/test';
import { sqafEvidencePolicy } from '../../../config/evidence';
import { SQAF_LOCATORS } from '../../../config/locators';

/**
 * Test support (Stage 4, E4.5 security closure): isolated Playwright
 * configuration that runs the samples in ./integration-artifacts against a
 * FAKE SUT served by tests/integration/security/integration-artifacts.spec.ts
 * (never the real SUT).
 *
 * It reproduces the integration run of CI: a project named `integration`, the
 * general evidence policy of CI (trace and video retained on failure), and NO
 * reporter here: the spec passes the `--output` and `--reporter` arguments
 * read from .github/workflows/ci.yml, so the files are produced by exactly
 * the CI command line.
 *
 * Each sample mirrors a real integration suite and keeps its path
 * (`pages/products.sample.ts` ↔ tests/integration/pages/products.spec.ts), so
 * its output folder is the CI one with `.sample.ts` after the file part
 * (`pages-products.sample.ts-…` ↔ `pages-products-…`).
 */
const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const ci = sqafEvidencePolicy(true);

export default defineConfig({
  workers: 1,
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 2_000 },
  projects: [
    {
      name: 'integration',
      testDir: './integration-artifacts',
      testMatch: '**/*.sample.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: required('SAMPLE_BASE_URL'),
        actionTimeout: 2_000,
        trace: ci.trace,
        screenshot: ci.screenshot,
        video: ci.video,
        testIdAttribute: SQAF_LOCATORS.testIdAttribute,
      },
    },
  ],
});
