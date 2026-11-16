import { expect, test } from '@playwright/test';
import { InfrastructureError } from '../../../../src/errors';

/**
 * Synthetic samples for the run summary reporter (no browser, no SUT). Run
 * only through tests/unit/support/summary-samples.config.ts (retries 1).
 * The secret-looking values below are fake and built at RUNTIME, so that no
 * code frame printed by Playwright contains them: only the error messages
 * can, and those must be redacted.
 */
const FAKE_SECRET = ['Sqaf#', 'x'.repeat(16)].join('');
const fakeEmail = (id: string): string => ['sqaf.', id, '@', 'example', '.com'].join('');

test('passes @smoke', { tag: '@smoke' }, () => {
  expect(1).toBe(1);
});

test('fails with an SUT error @smoke', { tag: '@smoke' }, () => {
  throw new InfrastructureError({
    classification: 'infrastructure/sut-unavailable',
    summary: `The SUT answered HTTP 503 for ${fakeEmail('user-sample-1')} (password=${FAKE_SECRET}).`,
    evidence: [],
    context: { Account: fakeEmail('user-sample-1'), Nested: { form: `email=${fakeEmail('user-sample-1')}` } },
    cause: new Error(`socket closed for ${fakeEmail('user-sample-1')}`),
  });
});

test('is flaky: fails on the first attempt only', ({}, testInfo) => {
  expect(testInfo.retry, 'first attempt fails').toBe(1);
});

test('title with an e-mail sqaf.user-sample-3@example.com', () => {
  expect(true).toBe(true);
});
