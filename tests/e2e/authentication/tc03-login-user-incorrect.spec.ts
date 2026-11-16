import { caseTitle, expect, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC3 — Login User with incorrect email and password (official test case;
 * baseline pair).
 *
 * Data-driven: one test per case of users/invalid-credentials.json (e-mails
 * on reserved domains that are never registered). No account is created, so
 * the general evidence policy applies.
 */
const tc = scenario('TC3');

for (const credentials of testData.invalidCredentials.all()) {
  test(caseTitle(tc.title, credentials), tc.details, async ({ homePage, signupLoginPage }) => {
    await test.step('Open the home page', async () => {
      await homePage.open();
    });

    await test.step('Go to Signup / Login', async () => {
      await homePage.header.goToSignupLogin();
      await signupLoginPage.waitUntilReady();
      await expect(signupLoginPage.loginHeading).toBeVisible();
    });

    await test.step('Log in with an incorrect e-mail and password', async () => {
      await signupLoginPage.login(credentials);
      await expect(signupLoginPage.loginError).toHaveText(credentials.expectedError);
      await expect(signupLoginPage.header.loggedInUser).toBeHidden();
    });
  });
}
