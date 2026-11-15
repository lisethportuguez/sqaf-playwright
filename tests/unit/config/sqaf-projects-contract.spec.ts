import { devices, expect, test } from '@playwright/test';
import { sqafConfig } from '../../../config';
import { SQAF_LOCATORS } from '../../../config/locators';
import playwrightConfig from '../../../playwright.config';
import { readJson, runPlaywright } from '../support/run-playwright';

/**
 * CONTRACT (Stage 2): every SQAF browser project (integration, chromium,
 * firefox, webkit) resolves to the E1 settings plus the `data-qa` locator
 * policy, while the baseline does not receive it (the baseline contract in
 * baseline-contract.spec.ts pins its exact `use`).
 *
 * Effective values come from Playwright itself (`--list`, no browser, no SUT).
 */

interface ProbedProject {
  readonly name: string;
  readonly retries: number;
  readonly timeout: number;
  readonly testDir: string;
  readonly use: Record<string, unknown>;
}

interface Probe {
  readonly projects: readonly ProbedProject[];
}

const SQAF_PROJECTS = [
  ['integration', 'Desktop Chrome', /\/tests\/integration$/],
  ['chromium', 'Desktop Chrome', /\/tests\/e2e$/],
  ['firefox', 'Desktop Firefox', /\/tests\/e2e$/],
  ['webkit', 'Desktop Safari', /\/tests\/e2e$/],
] as const;

function probe(env: Record<string, string>, outputFile: string): Probe {
  const run = runPlaywright(
    ['test', '--list', '--reporter=./tests/unit/support/config-probe-reporter.ts'],
    { ...env, SQAF_PROBE_OUTPUT: outputFile },
  );
  expect(run.status, run.stderr || run.stdout).toBe(0);
  return readJson<Probe>(outputFile);
}

test('the locator policy is data-qa and frozen', () => {
  expect(SQAF_LOCATORS).toEqual({ testIdAttribute: 'data-qa' });
  expect(Object.isFrozen(SQAF_LOCATORS)).toBe(true);
  expect(sqafConfig.locators).toBe(SQAF_LOCATORS);
});

for (const [label, env, retries, video] of [
  ['local (no CI)', {}, 0, 'off'],
  ['CI', { CI: '1' }, 2, 'retain-on-failure'],
] as const) {
  test(`SQAF browser projects resolve to the E1 settings plus data-qa (${label})`, async ({}, testInfo) => {
    const resolved = probe(env, testInfo.outputPath('probe.json'));
    for (const [name, device, testDir] of SQAF_PROJECTS) {
      const project = resolved.projects.find((candidate) => candidate.name === name);
      expect(project, name).toBeDefined();
      expect(project!.testDir.replaceAll('\\', '/'), name).toMatch(testDir);
      expect(project!.timeout, name).toBe(30_000);
      // Retries are the E1 global value (CI 2, local 0); Stage 2 does not change them.
      expect(project!.retries, name).toBe(retries);
      expect(project!.use, name).toEqual({
        ...devices[device],
        baseURL: 'https://automationexercise.com',
        actionTimeout: 10_000,
        navigationTimeout: 30_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video,
        testIdAttribute: 'data-qa',
      });
    }
    const baseline = resolved.projects.find((candidate) => candidate.name === 'baseline');
    expect(baseline!.use['testIdAttribute']).toBeUndefined();
  });
}

test('declared values: integration keeps the SQAF expect timeout and no own retries/workers', () => {
  const integration = playwrightConfig.projects?.find((project) => project.name === 'integration');
  expect(integration?.expect).toEqual({ timeout: 5_000 });
  expect(integration?.retries).toBeUndefined();
  expect(integration?.workers).toBeUndefined();
});
