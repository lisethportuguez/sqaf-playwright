import { CREDENTIAL_SAFE_EVIDENCE, expect, test } from '@sqaf/fixtures';

/** Credential tests WITH the policy: they run, and nothing they record contains a password. */
test.use(CREDENTIAL_SAFE_EVIDENCE);

test('passing: testUser logs in through the UI', async ({ testUser, signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login(testUser);
  await expect(signupLoginPage.loginButton).toBeVisible();
});

test('failing assertion while the password is still in the form', async ({ testUser, signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login(testUser);
  await expect(signupLoginPage.loginError).toBeVisible();
});

test('failing action while the password is still in the form', async ({ testUser, signupLoginPage, page }) => {
  await signupLoginPage.open();
  await signupLoginPage.login(testUser);
  await page.getByRole('link', { name: 'Missing link' }).click();
});

test('failing API-only test with newUserData', async ({ accountApi, newUserData }) => {
  await accountApi.createAccount(newUserData);
  expect(await accountApi.findAccountByEmail(newUserData.email)).toBeUndefined();
});
