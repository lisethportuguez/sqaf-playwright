import { defineConfig, devices } from '@playwright/test';

/**
 * SQAF — Playwright configuration (Stage 0).
 * Centralized configuration (environments, evidence policy, reporters) is
 * planned for Stage 1. See docs/architecture/architecture.md.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only (SQAF suites). The baseline project overrides this with 0. */
  retries: process.env.CI ? 2 : 0,
  /* One worker on CI (approved Stage 0 decision). */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  use: {
    /* System Under Test */
    baseURL: 'https://automationexercise.com',
    trace: 'on-first-retry',
  },

  projects: [
    /*
     * Experimental baseline: 5 scenarios written WITHOUT the SQAF architecture.
     * retries = 0 so stability is measured without masking failures.
     */
    {
      name: 'baseline',
      testDir: './baseline',
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },

    /* SQAF suites (tests/ is populated from Stage 4 onwards). */
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
