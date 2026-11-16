import { CREDENTIAL_SAFE_EVIDENCE, expect, test } from '@sqaf/fixtures';

/**
 * Sample (fake SUT only) of tests/integration/data/account-api.spec.ts: the
 * account fixtures create, clean up and attach `sqaf-account-cleanup`; the
 * login types the synthetic e-mail with `fill` (a `Fill "…"` step title).
 * Its output folder is NOT selected by the upload paths of ci.yml.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

test('API: creates, finds and deletes an account', async ({ accountApi, newUserData }) => {
  await accountApi.createAccount(newUserData);
  expect(await accountApi.findAccountByEmail(newUserData.email)).toMatchObject({ email: newUserData.email });
  expect(await accountApi.deleteAccount(newUserData)).toBe('deleted');
});

test('UI: testUser logs in and the check fails with the e-mail still in the form', async ({ testUser, signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login(testUser);
  await expect(signupLoginPage.loginError).toBeVisible();
});
