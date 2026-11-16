import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, test } from '@playwright/test';
import { CREDENTIAL_EVIDENCE, credentialEvidenceViolations, sqafConfig } from '../../../config';
import { sqafEvidencePolicy } from '../../../config/evidence';
import { CREDENTIAL_SAFE_EVIDENCE } from '../../../src/fixtures';
import { redactTestErrors } from '../../../src/fixtures/data.fixture';
import { generatedPassword, REDACTED } from '../../../src/utils';

/**
 * Stage 3 security adjustment (ADR-0009 D16) — contract of the
 * credential-safe evidence policy. The behaviour with a real browser and the
 * real Playwright artifacts is verified by
 * tests/integration/security/credential-evidence.spec.ts.
 */

test.describe('the policy', () => {
  test('credential tests: no trace, no video, screenshot only on failure', () => {
    expect(CREDENTIAL_EVIDENCE).toEqual({ trace: 'off', screenshot: 'only-on-failure', video: 'off' });
    expect(sqafConfig.credentialEvidence).toBe(CREDENTIAL_EVIDENCE);
    expect(CREDENTIAL_SAFE_EVIDENCE).toEqual(CREDENTIAL_EVIDENCE);
    expect(Object.isFrozen(CREDENTIAL_EVIDENCE)).toBe(true);
  });

  test('the general Stage 1 policy is unchanged', () => {
    expect(sqafEvidencePolicy(true)).toEqual({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' });
    expect(sqafEvidencePolicy(false)).toEqual({ trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'off' });
    expect(sqafConfig.evidence).toEqual(sqafEvidencePolicy(sqafConfig.isCI));
  });

  test('the guard rejects the general policy and accepts the credential-safe one', () => {
    expect(credentialEvidenceViolations(sqafEvidencePolicy(true))).toEqual([
      'trace is "retain-on-failure" (must be "off")',
      'video is "retain-on-failure" (must be "off")',
    ]);
    expect(credentialEvidenceViolations(sqafEvidencePolicy(false))).toEqual(['trace is "retain-on-failure" (must be "off")']);
    expect(credentialEvidenceViolations(CREDENTIAL_EVIDENCE)).toEqual([]);
    expect(credentialEvidenceViolations({ trace: 'off', video: 'off', screenshot: 'off' })).toEqual([]);
  });

  test('the guard reads the object form of the options and rejects every recording mode', () => {
    for (const mode of ['on', 'retain-on-failure', 'on-first-retry', 'on-all-retries', 'retain-on-first-failure']) {
      expect(credentialEvidenceViolations({ trace: { mode }, video: 'off', screenshot: 'off' })).toHaveLength(1);
      expect(credentialEvidenceViolations({ trace: 'off', video: { mode }, screenshot: 'off' })).toHaveLength(1);
    }
    expect(credentialEvidenceViolations({ trace: 'off', video: 'off', screenshot: { mode: 'on' } })).toEqual([
      'screenshot is "on" (must be "only-on-failure" or "off")',
    ]);
  });
});

test.describe('redaction of the test errors', () => {
  test('exact secrets and generated passwords are removed from every text field and cause', () => {
    const secret = generatedPassword();
    const other = generatedPassword();
    const errors = [
      {
        message: `expected ${secret}`,
        stack: `Error: expected ${secret}\n    at x`,
        value: secret,
        errorContext: `- textbox "Password": ${secret}`,
        cause: { message: `password=${other}` },
      },
    ];
    redactTestErrors(errors, [secret]);
    const text = JSON.stringify(errors);
    expect(text).not.toContain(secret);
    expect(text).not.toContain(other);
    expect(errors[0]!.errorContext).toBe(`- textbox "Password": ${REDACTED}`);
  });
});

/** Suites: every spec file under tests/integration and tests/e2e. */
function suites(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.spec\.ts$/.test(entry)) out.push(path);
    }
  };
  walk(join(process.cwd(), 'tests', 'integration'));
  walk(join(process.cwd(), 'tests', 'e2e'));
  return out;
}

const CREDENTIAL_FIXTURE = /[{,]\s*(?:testUser|newUserData|accountApi)\b[^}]*}\s*\)\s*=>/;
const TOP_LEVEL_SAFE_POLICY = /^test\.use\(CREDENTIAL_SAFE_EVIDENCE\);$/m;
const EVIDENCE_OVERRIDE = /test\.use\(\s*\{[^}]*\b(?:trace|video|screenshot)\s*:/;

test.describe('the suites', () => {
  const files = suites();

  test('there are suites to check, and at least one handles credentials', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((file) => CREDENTIAL_FIXTURE.test(readFileSync(file, 'utf8')))).toBe(true);
  });

  test('every suite that uses testUser, newUserData or accountApi declares the policy at the top level', () => {
    const missing = files
      .filter((file) => CREDENTIAL_FIXTURE.test(readFileSync(file, 'utf8')))
      .filter((file) => !TOP_LEVEL_SAFE_POLICY.test(readFileSync(file, 'utf8')))
      .map((file) => relative(process.cwd(), file));
    expect(missing).toEqual([]);
  });

  test('suites that do not handle credentials keep the general policy (no evidence override)', () => {
    const overriding = files
      .filter((file) => !CREDENTIAL_FIXTURE.test(readFileSync(file, 'utf8')))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');
        return TOP_LEVEL_SAFE_POLICY.test(source) || EVIDENCE_OVERRIDE.test(source);
      })
      .map((file) => relative(process.cwd(), file));
    expect(overriding).toEqual([]);
  });
});
