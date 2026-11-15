import { devices, expect, test } from '@playwright/test';
import playwrightConfig from '../../../playwright.config';
import { readJson, runPlaywright } from '../support/run-playwright';

/**
 * CONTRACT: the experimental baseline keeps the Stage 0 conditions.
 *
 * If this test fails, the Stage 7 comparison (baseline vs SQAF) is no longer
 * fair. Change the baseline conditions only through an approved ADR.
 *
 * Two complementary checks:
 *  1. EFFECTIVE values, resolved by Playwright itself (`--list` with a probe
 *     reporter: no browser, no SUT), under several environments.
 *  2. DECLARED values for the two settings Playwright does not expose in the
 *     resolved project (expect timeout and project workers), plus the absence
 *     of global settings that could override them.
 *
 * Stage 0 declared `trace: 'on-first-retry'` with `retries: 0`: a first retry
 * never happens, so the effective trace was "off". Stage 1 writes 'off'
 * explicitly; the last test pins both facts.
 */

interface ProbedProject {
  readonly name: string;
  readonly retries: number;
  readonly timeout: number;
  readonly testDir: string;
  readonly use: Record<string, unknown>;
  readonly tests: readonly string[];
}

interface Probe {
  readonly workers: number;
  readonly projects: readonly ProbedProject[];
}

const STAGE0_TESTS = [
  'registers a new user through the UI',
  'TC3 - Login User with incorrect email and password',
  'TC8 - Verify All Products and product detail page',
  'TC9 - Search Product',
  'TC12 - Add Products in Cart',
];

const STAGE0_USE = {
  ...devices['Desktop Chrome'],
  baseURL: 'https://automationexercise.com',
  actionTimeout: 0,
  navigationTimeout: 0,
  trace: 'off',
  screenshot: 'off',
  video: 'off',
};

const ENVIRONMENTS: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['local (no CI)', {}],
  ['CI', { CI: '1' }],
  ['CI with SQAF overrides', { CI: '1', SQAF_ENV: 'production', SQAF_BASE_URL: 'https://mirror.example.org' }],
];

for (const [label, env] of ENVIRONMENTS) {
  test(`effective baseline configuration is Stage 0 (${label})`, async ({}, testInfo) => {
    const output = testInfo.outputPath('probe.json');
    const run = runPlaywright(
      ['test', '--list', '--project=baseline', '--reporter=./tests/unit/support/config-probe-reporter.ts'],
      { ...env, SQAF_PROBE_OUTPUT: output },
    );
    expect(run.status, run.stderr || run.stdout).toBe(0);

    const probe = readJson<Probe>(output);
    const baseline = probe.projects.find((project) => project.name === 'baseline');
    expect(baseline).toBeDefined();
    expect(baseline!.testDir.replaceAll('\\', '/')).toMatch(/\/baseline$/);
    expect(baseline!.retries).toBe(0);
    expect(baseline!.timeout).toBe(30_000);
    expect(baseline!.use).toEqual(STAGE0_USE);
    expect(baseline!.use['defaultBrowserType']).toBe('chromium');
    expect(baseline!.tests).toEqual(STAGE0_TESTS);
    if (env['CI']) expect(probe.workers).toBe(1);
  });
}

test('declared baseline values that Playwright does not expose once resolved', () => {
  const baseline = playwrightConfig.projects?.find((project) => project.name === 'baseline');
  expect(baseline?.expect).toEqual({ timeout: 5_000 });
  expect(baseline?.workers).toBe(1);
  expect(baseline?.retries).toBe(0);
  // Nothing global may override or leak into the project.
  expect(playwrightConfig.expect).toBeUndefined();
  expect(playwrightConfig.use).toBeUndefined();
  expect(playwrightConfig.timeout).toBeUndefined();
});

test('Stage 0 trace "on-first-retry" with retries 0 was effectively "off"; Stage 1 states it explicitly', () => {
  const baseline = playwrightConfig.projects?.find((project) => project.name === 'baseline');
  expect(baseline?.retries).toBe(0);
  expect(baseline?.use?.trace).toBe('off');
  expect(baseline?.use?.screenshot).toBe('off');
  expect(baseline?.use?.video).toBe('off');
});
