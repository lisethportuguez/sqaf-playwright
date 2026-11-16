import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 4 (E4.5, ADR-0010 D12): no versioned document, metric or data file
 * names a real test account. A SQAF data id (`user-<run token>-<entropy>-<n>`)
 * rebuilds the account e-mail (`sqaf.<dataId>@example.com`), so validation
 * records use stable pseudonyms (`cuenta-01`, …) instead. Fictitious ids
 * quoted in the documentation (`user-sample-3`) have no run token.
 *
 * tests/ is not scanned: its fictitious ids are built for the redaction tests.
 * The only exception is the Stage 3 validation record, already published in
 * v0.3.0 before D12 and frozen (its accounts were deleted and verified absent).
 */
const ROOTS = ['README.md', 'docs', 'metrics', 'src', 'test-data', 'config'];
const FROZEN_BEFORE_D12 = new Set(['docs/validation/E3-test-data-management.md']);
const REAL_DATA_ID = /user-[a-z0-9]{8}-[0-9a-f]{8}-\d+/;

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path.replaceAll('\\', '/')];
  return readdirSync(path).flatMap((entry) => files(join(path, entry)));
}

test('no versioned record outside tests/ contains a real account data id (nor, therefore, its e-mail)', () => {
  const scanned = ROOTS.flatMap(files).filter((file) => !FROZEN_BEFORE_D12.has(file));
  expect(scanned).toContain('metrics/experiments/E4-sqaf/summary.json');
  expect(scanned).toContain('docs/validation/E4-functional-scenarios.md');
  const offenders = scanned.filter((file) => {
    const text = readFileSync(file, 'utf8');
    return REAL_DATA_ID.test(text);
  });
  expect(offenders).toEqual([]);
});

test('control: the pattern detects a real data id and the frozen E3 record still has its own', () => {
  expect(REAL_DATA_ID.test('`user-mwab12cd-0123abcd-1`')).toBe(true);
  expect(REAL_DATA_ID.test('`cuenta-01`')).toBe(false);
  expect(REAL_DATA_ID.test(readFileSync([...FROZEN_BEFORE_D12][0]!, 'utf8'))).toBe(true);
});
