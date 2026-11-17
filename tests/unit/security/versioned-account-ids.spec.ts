import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * ADR-0010 D12: no versioned document, metric or data file names a real test
 * account. A SQAF data id (`user-<run token>-<entropy>-<n>`) rebuilds the
 * account e-mail (`sqaf.<dataId>@example.com`), so validation records use
 * stable pseudonyms (`cuenta-01`, …) instead. Fictitious ids quoted in the
 * documentation (`user-sample-3`) have no run token.
 *
 * tests/ is not scanned: its fictitious ids are built for the redaction tests.
 * No real identifier is stored here: the checks use the SHAPE of a data id,
 * and the controls build theirs at runtime.
 */
const ROOTS = ['README.md', 'docs', 'metrics', 'src', 'test-data', 'config'];
const E3_RECORD = 'docs/validation/E3-test-data-management.md';

/** `<run token>-<entropy>-<n>`: the unique part of a data id, with or without its `user-` prefix. */
const DATA_ID_CORE = /\b[a-z0-9]{8}-[0-9a-f]{8}-\d+\b/;
/** A SQAF account address built from a data id (`@` or URL-encoded `%40`). */
const ACCOUNT_EMAIL = /sqaf\.user-[^\s`'"<>]*(?:@|%40)/i;
const PSEUDONYM = /\bcuenta-\d{2}\b/g;

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path.replaceAll('\\', '/')];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

/** A data id with the real shape, built at runtime (never a real one). */
const fakeDataId = (n: number): string => ['user', 'zz00zz00', 'abcdef01', String(n)].join('-');

test('no versioned record outside tests/ contains a real account data id', () => {
  const scanned = ROOTS.flatMap(files);
  for (const record of ['metrics/experiments/E4-sqaf/summary.json', 'docs/validation/E4-functional-scenarios.md', E3_RECORD]) {
    expect(scanned).toContain(record);
  }
  const offenders = scanned.filter((file) => DATA_ID_CORE.test(readFileSync(file, 'utf8')));
  expect(offenders).toEqual([]);
});

test('the E3 validation record keeps only pseudonyms: no data id and no reconstructible e-mail', () => {
  const text = readFileSync(E3_RECORD, 'utf8');
  expect(text).not.toMatch(DATA_ID_CORE);
  expect(text).not.toMatch(ACCOUNT_EMAIL);
  // The 6 accounts of §5.1, §5.2 and §9.4 are still there, as stable pseudonyms (also inside the 4 addresses).
  expect(new Set(text.match(PSEUDONYM))).toEqual(new Set(['cuenta-01', 'cuenta-02', 'cuenta-03', 'cuenta-04', 'cuenta-05', 'cuenta-06']));
  expect(text.match(/sqaf\.<cuenta-0[1-4]>@example\.com/g)).toHaveLength(4);
});

test('control: the detectors find a reintroduced data id or e-mail and allow the pseudonyms', () => {
  const id = fakeDataId(1);
  for (const leaked of [`| \`newUserData\` | \`${id}\` |`, `the id ${id.slice('user-'.length)}`, `sqaf.${id}@example.com`]) {
    expect(DATA_ID_CORE.test(leaked), leaked).toBe(true);
  }
  expect(ACCOUNT_EMAIL.test(`(\`sqaf.${id}@example.com\`)`)).toBe(true);
  expect(ACCOUNT_EMAIL.test(`email=sqaf.${id}%40example.com`)).toBe(true);
  // Allowed: pseudonyms, the API probe address of E3 §2 and CI artifact names.
  for (const allowed of ['`cuenta-01`', 'sqaf.<cuenta-03>@example.com', 'sqaf.audit-nonexistent-0@example.com', 'integration-report-43798520805-1']) {
    expect(DATA_ID_CORE.test(allowed) || ACCOUNT_EMAIL.test(allowed), allowed).toBe(false);
  }
});
