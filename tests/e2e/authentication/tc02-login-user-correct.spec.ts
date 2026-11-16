import { CREDENTIAL_SAFE_EVIDENCE, credentialsOf, expect, scenario, test } from '@sqaf/fixtures';

/**
 * TC2 — Login User with correct email and password (official test case).
 *
 * The account is created through the API (`testUser`), the scenario logs in
 * and deletes it through the UI; the fixture verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC2');

test(tc.title, tc.details, async ({ testUser, homePage, signupLoginPage, accountDeletedPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Go to Signup / Login', async () => {
    await homePage.header.goToSignupLogin();
    await signupLoginPage.waitUntilReady();
    await expect(signupLoginPage.loginHeading).toBeVisible();
  });

  await test.step('Log in with the correct e-mail and password', async () => {
    await signupLoginPage.login(credentialsOf(testUser));
    await homePage.waitUntilReady();
    await expect(homePage.header.loggedInUser).toHaveText(`Logged in as ${testUser.name}`);
  });

  await test.step('Delete the account through the UI', async () => {
    await homePage.header.deleteAccount();
    await accountDeletedPage.waitUntilReady();
    await expect(accountDeletedPage.confirmation).toHaveText('Account Deleted!');
  });
});
