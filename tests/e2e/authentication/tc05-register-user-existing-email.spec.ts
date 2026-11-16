import { CREDENTIAL_SAFE_EVIDENCE, expect, scenario, test } from '@sqaf/fixtures';

/**
 * TC5 — Register User with existing email (official test case).
 *
 * The existing account is created through the API (`testUser`). The signup
 * with its e-mail must be rejected before the account information form; the
 * fixture deletes the account and verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC5');

test(tc.title, tc.details, async ({ testUser, homePage, signupLoginPage, accountInformationPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Go to Signup / Login', async () => {
    await homePage.header.goToSignupLogin();
    await signupLoginPage.waitUntilReady();
    await expect(signupLoginPage.signupHeading).toBeVisible();
  });

  await test.step('Sign up with an already registered e-mail', async () => {
    await signupLoginPage.startSignup({ name: testUser.name, email: testUser.email });
    await signupLoginPage.waitUntilReady();
    await expect(signupLoginPage.signupError).toHaveText('Email Address already exist!');
    await expect(accountInformationPage.heading).toBeHidden();
    await expect(signupLoginPage.header.loggedInUser).toBeHidden();
  });
});
