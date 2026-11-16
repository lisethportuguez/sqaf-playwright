import { CREDENTIAL_SAFE_EVIDENCE, credentialsOf, expect, scenario, test } from '@sqaf/fixtures';

/**
 * TC4 — Logout User (official test case).
 *
 * The account is created through the API (`testUser`) and deleted by the
 * fixture after the test, which verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC4');

test(tc.title, tc.details, async ({ testUser, homePage, signupLoginPage }) => {
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

  await test.step('Log out and return to the login page', async () => {
    await homePage.header.logout();
    await signupLoginPage.waitUntilReady();
    await expect(signupLoginPage.page).toHaveURL(/\/login$/);
    await expect(signupLoginPage.header.loggedInUser).toBeHidden();
  });
});
