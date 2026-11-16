import { expect, test } from '@playwright/test';

/**
 * Synthetic FAILING unit-like samples (no browser, no SUT). Run only through
 * tests/unit/support/failure-evidence.config.ts. They reproduce what a real
 * unit failure leaves behind: fictitious e-mails and URL credentials written
 * as literals in the source (shown by Playwright's code frames), and values
 * that reach the error message (an account address with its data id, a
 * generated-looking password and a public test card number).
 *
 * Every value is fictitious. The password and card number are built at
 * runtime, so they appear only in error messages, never in code frames.
 */
const PASSWORD = ['Sqaf#', 'z'.repeat(16)].join('');
const CARD = ['4111', '1111', '1111', '1111'].join('');

test('fails on a configuration URL with credentials', () => {
  const url = 'https://user:secret@automationexercise.com';
  expect(url, 'must not contain credentials').toBe('https://automationexercise.com');
});

test('fails on an account e-mail', () => {
  const account = 'sqaf.user-evidence-1@example.com';
  expect({ account, password: PASSWORD, card: CARD }).toEqual({ account: 'other' });
});

test('title with an e-mail sqaf.user-evidence-2@example.com fails', () => {
  expect(`card ${CARD} for sqaf.user-evidence-2@example.com`).toBe('x');
});
