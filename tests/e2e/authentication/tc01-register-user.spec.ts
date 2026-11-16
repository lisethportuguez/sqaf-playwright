import { CREDENTIAL_SAFE_EVIDENCE, expect, scenario, test } from '@sqaf/fixtures';

/**
 * TC1 — Register User (official Automation Exercise test case; baseline pair).
 *
 * Registers a NEW user through the UI and deletes it through the UI. The
 * `newUserData` fixture deletes it again through the API if the test fails
 * before the UI deletion, and verifies that the account no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC1');

test(tc.title, tc.details, async ({ newUserData, homePage, signupLoginPage, userFlows, accountDeletedPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Go to Signup / Login', async () => {
    await homePage.header.goToSignupLogin();
    await expect(signupLoginPage.signupHeading).toBeVisible();
  });

  await userFlows.registerViaUi(newUserData);

  await test.step('Delete the account through the UI', async () => {
    await homePage.header.deleteAccount();
    await accountDeletedPage.waitUntilReady();
    await expect(accountDeletedPage.confirmation).toHaveText('Account Deleted!');
    await accountDeletedPage.continue();
    await homePage.waitUntilReady();
    await expect(homePage.header.loggedInUser).toBeHidden();
  });
});
