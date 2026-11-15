import { expect, test } from '@playwright/test';
import { buildSqafConfig } from '../../../config';
import { resolveEnvironment } from '../../../config/environment';
import { BASELINE_EVIDENCE, sqafEvidencePolicy } from '../../../config/evidence';
import { BASELINE_TIMEOUTS, SQAF_TIMEOUTS } from '../../../config/timeouts';

test.describe('sqafConfig', () => {
  test('is frozen at every level', () => {
    const config = buildSqafConfig(resolveEnvironment({}));
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.baseline)).toBe(true);
    expect(Object.isFrozen(config.timeouts)).toBe(true);
    expect(Object.isFrozen(config.evidence)).toBe(true);
    expect(Object.isFrozen(config.reporting)).toBe(true);
    expect(Object.isFrozen(config.baseline.timeouts)).toBe(true);
    expect(Object.isFrozen(config.baseline.evidence)).toBe(true);
  });

  test('uses the SQAF timeouts for the SQAF suites', () => {
    expect(buildSqafConfig(resolveEnvironment({})).timeouts).toEqual({
      test: 30_000,
      expect: 5_000,
      action: 10_000,
      navigation: 30_000,
    });
  });

  test('keeps evidence only for failures; video only in CI', () => {
    expect(sqafEvidencePolicy(false)).toEqual({
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      video: 'off',
    });
    expect(sqafEvidencePolicy(true)).toEqual({
      trace: 'retain-on-failure',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
    });
  });

  test('baseline conditions are the Stage 0 ones, whatever the environment says', () => {
    const overridden = buildSqafConfig(
      resolveEnvironment({ CI: '1', SQAF_BASE_URL: 'https://mirror.example.org' }),
    );
    expect(overridden.environment.baseURL).toBe('https://mirror.example.org');
    expect(overridden.baseline).toEqual({
      baseURL: 'https://automationexercise.com',
      retries: 0,
      workers: 1,
      timeouts: { test: 30_000, expect: 5_000, action: 0, navigation: 0 },
      evidence: { trace: 'off', screenshot: 'off', video: 'off' },
    });
    expect(overridden.baseline.timeouts).toBe(BASELINE_TIMEOUTS);
    expect(overridden.baseline.evidence).toBe(BASELINE_EVIDENCE);
    expect(overridden.timeouts).toBe(SQAF_TIMEOUTS);
  });
});
