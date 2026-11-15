import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  ConfigurationError,
  loadEnvFileIfPresent,
  parseBaseURL,
  resolveEnvironment,
} from '../../../config/environment';
import { ENVIRONMENTS } from '../../../config/environments';

test.describe('resolveEnvironment', () => {
  test('defaults to production when nothing is set', () => {
    expect(resolveEnvironment({})).toEqual({
      name: 'production',
      baseURL: 'https://automationexercise.com',
      baseURLOverridden: false,
      isCI: false,
    });
  });

  test('treats empty or blank variables as unset', () => {
    const resolved = resolveEnvironment({ SQAF_ENV: '  ', SQAF_BASE_URL: '' });
    expect(resolved.name).toBe('production');
    expect(resolved.baseURLOverridden).toBe(false);
  });

  test('accepts a known SQAF_ENV with surrounding whitespace', () => {
    expect(resolveEnvironment({ SQAF_ENV: ' production ' }).name).toBe('production');
  });

  test('rejects an unknown SQAF_ENV and lists the allowed values', () => {
    expect(() => resolveEnvironment({ SQAF_ENV: 'staging' })).toThrow(ConfigurationError);
    expect(() => resolveEnvironment({ SQAF_ENV: 'staging' })).toThrow(
      'SQAF_ENV="staging" is not defined. Allowed values: production.',
    );
  });

  test('rejects inherited object keys as environment names', () => {
    expect(() => resolveEnvironment({ SQAF_ENV: 'toString' })).toThrow(ConfigurationError);
  });

  test('applies a valid SQAF_BASE_URL override, normalized to its origin', () => {
    const resolved = resolveEnvironment({ SQAF_BASE_URL: 'https://mirror.example.org/' });
    expect(resolved.baseURL).toBe('https://mirror.example.org');
    expect(resolved.baseURLOverridden).toBe(true);
  });

  test('keeps the Stage 0 CI semantics: any non-empty CI value means CI', () => {
    expect(resolveEnvironment({ CI: 'true' }).isCI).toBe(true);
    expect(resolveEnvironment({ CI: '1' }).isCI).toBe(true);
    expect(resolveEnvironment({ CI: '' }).isCI).toBe(false);
    expect(resolveEnvironment({}).isCI).toBe(false);
  });

  test('does not modify the environment catalogue', () => {
    resolveEnvironment({ SQAF_BASE_URL: 'https://mirror.example.org' });
    expect(ENVIRONMENTS.production.baseURL).toBe('https://automationexercise.com');
  });
});

test.describe('parseBaseURL', () => {
  const invalid: ReadonlyArray<readonly [string, string]> = [
    ['not a url', 'must be an absolute URL'],
    ['automationexercise.com', 'must be an absolute URL'],
    ['ftp://automationexercise.com', 'must use http or https'],
    ['https://user:secret@automationexercise.com', 'must not contain credentials'],
    ['https://automationexercise.com/products', 'must be an origin'],
    ['https://automationexercise.com/?q=1', 'must be an origin'],
    ['https://automationexercise.com/#top', 'must be an origin'],
  ];

  for (const [value, message] of invalid) {
    test(`rejects "${value}"`, () => {
      expect(() => parseBaseURL(value)).toThrow(ConfigurationError);
      expect(() => parseBaseURL(value)).toThrow(message);
    });
  }

  test('accepts http and https origins, with port', () => {
    expect(parseBaseURL('http://localhost:8080')).toBe('http://localhost:8080');
    expect(parseBaseURL('https://automationexercise.com')).toBe('https://automationexercise.com');
  });
});

test.describe('loadEnvFileIfPresent', () => {
  test('returns false when the file does not exist', () => {
    expect(loadEnvFileIfPresent(join(tmpdir(), 'sqaf-missing-file.env'))).toBe(false);
  });

  test('loads new variables but never overrides existing ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sqaf-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'SQAF_UNIT_FROM_FILE=file\nSQAF_UNIT_PRESET=file\n', 'utf8');
    process.env['SQAF_UNIT_PRESET'] = 'shell';
    try {
      expect(loadEnvFileIfPresent(file)).toBe(true);
      expect(process.env['SQAF_UNIT_FROM_FILE']).toBe('file');
      expect(process.env['SQAF_UNIT_PRESET']).toBe('shell');
    } finally {
      delete process.env['SQAF_UNIT_FROM_FILE'];
      delete process.env['SQAF_UNIT_PRESET'];
    }
  });
});
