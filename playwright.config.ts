import {
  defineConfig,
  devices,
  type PlaywrightTestOptions,
  type PlaywrightWorkerOptions,
} from '@playwright/test';
import { sqafConfig } from './config';

/**
 * SQAF — Playwright configuration (Stage 1).
 *
 * Every value comes from the Configuration layer (`config/`). See
 * docs/architecture/architecture.md and ADR-0005.
 *
 * Projects:
 *  - unit      Framework unit tests (no browser, no SUT).
 *  - baseline  Experimental baseline with FROZEN Stage 0 conditions. Guarded
 *              by tests/unit/config/baseline-contract.spec.ts.
 *  - chromium / firefox / webkit  SQAF suites (tests/e2e, from Stage 4).
 */
const { environment, isCI, timeouts, evidence, baseline, reporting } = sqafConfig;

/** Shared `use` of the SQAF browser projects. */
const sqafUse: Partial<PlaywrightTestOptions & PlaywrightWorkerOptions> = {
  baseURL: environment.baseURL,
  actionTimeout: timeouts.action,
  navigationTimeout: timeouts.navigation,
  trace: evidence.trace,
  screenshot: evidence.screenshot,
  video: evidence.video,
};

export default defineConfig({
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: isCI,
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Retry on CI only (SQAF suites). The baseline and unit projects override this with 0. */
  retries: isCI ? 2 : 0,
  /* One worker on CI (approved Stage 0 decision). */
  workers: isCI ? 1 : undefined,
  /* Console + HTML report, plus the informational failure classification (ADR-0006). */
  reporter: [
    ...(isCI ? ([['list'], ['html', { open: 'never' }]] as const) : ([['html']] as const)),
    ['./src/reporting/failure-classification-reporter.ts', { outputFile: reporting.classificationOutputFile }],
  ],

  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
      retries: 0,
    },

    /*
     * Experimental baseline: 5 scenarios written WITHOUT the SQAF architecture.
     * Stage 0 conditions are written out explicitly so that no global SQAF
     * setting can leak into it: Chromium, 1 worker, retries 0, 30 s / 5 s
     * timeouts, no action/navigation limit, no trace/screenshot/video, and
     * always the production SUT.
     */
    {
      name: 'baseline',
      testDir: './baseline',
      retries: baseline.retries,
      workers: baseline.workers,
      timeout: baseline.timeouts.test,
      expect: { timeout: baseline.timeouts.expect },
      use: {
        ...devices['Desktop Chrome'],
        baseURL: baseline.baseURL,
        actionTimeout: baseline.timeouts.action,
        navigationTimeout: baseline.timeouts.navigation,
        trace: baseline.evidence.trace,
        screenshot: baseline.evidence.screenshot,
        video: baseline.evidence.video,
      },
    },

    /* SQAF suites (tests/e2e is populated from Stage 4 onwards). */
    {
      name: 'chromium',
      testDir: './tests/e2e',
      timeout: timeouts.test,
      expect: { timeout: timeouts.expect },
      use: { ...devices['Desktop Chrome'], ...sqafUse },
    },
    {
      name: 'firefox',
      testDir: './tests/e2e',
      timeout: timeouts.test,
      expect: { timeout: timeouts.expect },
      use: { ...devices['Desktop Firefox'], ...sqafUse },
    },
    {
      name: 'webkit',
      testDir: './tests/e2e',
      timeout: timeouts.test,
      expect: { timeout: timeouts.expect },
      use: { ...devices['Desktop Safari'], ...sqafUse },
    },
  ],
});
