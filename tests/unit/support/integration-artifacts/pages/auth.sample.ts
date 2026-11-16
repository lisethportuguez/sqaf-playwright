import { randomUUID } from 'node:crypto';
import { expect, test } from '@sqaf/fixtures';

/**
 * Sample (fake SUT only) of tests/integration/pages/auth.spec.ts: no account
 * fixture, so the GENERAL evidence policy applies (trace and video on
 * failure), and the login form holds a synthetic e-mail when the check fails.
 * Its output folder is NOT selected by the upload paths of ci.yml.
 */
test('invalid login: the error check fails with a synthetic e-mail in the form', async ({ signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login({ email: `sqaf.nonexistent+${randomUUID()}@example.com`, password: 'not-a-real-password' });
  await expect(signupLoginPage.loginError).toBeVisible();
});
