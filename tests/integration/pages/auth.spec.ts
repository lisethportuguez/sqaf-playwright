import { randomUUID } from 'node:crypto';
import { expect, test, type AccountDetails } from '@sqaf/fixtures';

/**
 * Stage 2 — Authentication Page Objects against the SUT.
 * No account is created (D8): the registration form is filled, never submitted.
 */

test('the Signup / Login page exposes the login and signup forms', async ({ signupLoginPage }) => {
  await signupLoginPage.open();

  await expect(signupLoginPage.loginEmailInput).toBeEditable();
  await expect(signupLoginPage.loginPasswordInput).toBeEditable();
  await expect(signupLoginPage.loginButton).toBeEnabled();
  await expect(signupLoginPage.signupNameInput).toBeEditable();
  await expect(signupLoginPage.signupEmailInput).toBeEditable();
  await expect(signupLoginPage.signupButton).toBeEnabled();
});

test('login with invalid credentials shows the error message', async ({ homePage, signupLoginPage }) => {
  await homePage.open();
  await homePage.header.goToSignupLogin();
  await signupLoginPage.waitUntilReady();

  await signupLoginPage.login({
    email: `sqaf.nonexistent+${randomUUID()}@example.com`,
    password: 'WrongPassword123',
  });

  await expect(signupLoginPage.loginError).toBeVisible();
});

test('the registration form can be filled without submitting it', async ({
  page,
  signupLoginPage,
  accountInformationPage,
}) => {
  const details: AccountDetails = {
    title: 'Mrs',
    password: `Sqaf#${randomUUID()}`,
    birthDate: { day: '10', month: '5', year: '1995' },
    newsletter: true,
    specialOffers: false,
    firstName: 'Ana',
    lastName: 'Integration',
    company: 'SQAF',
    address: 'Avenida Central 100',
    address2: 'Edificio 2',
    country: 'Canada',
    state: 'Ontario',
    city: 'Toronto',
    zipcode: 'M5H 2N2',
    mobileNumber: '4165550100',
  };
  const email = `sqaf.integration+${randomUUID()}@example.com`;

  await signupLoginPage.open();
  await signupLoginPage.startSignup({ name: 'SQAF Integration', email });
  await accountInformationPage.waitUntilReady();

  await accountInformationPage.fill(details);

  await expect(accountInformationPage.mrsRadio).toBeChecked();
  await expect(accountInformationPage.nameInput).toHaveValue('SQAF Integration');
  await expect(accountInformationPage.emailInput).toHaveValue(email);
  await expect(accountInformationPage.birthDaySelect).toHaveValue('10');
  await expect(accountInformationPage.birthMonthSelect).toHaveValue('5');
  await expect(accountInformationPage.birthYearSelect).toHaveValue('1995');
  await expect(accountInformationPage.newsletterCheckbox).toBeChecked();
  await expect(accountInformationPage.specialOffersCheckbox).not.toBeChecked();
  await expect(accountInformationPage.countrySelect).toHaveValue('Canada');
  // The "Zipcode" label points to City in the SUT; data-qa keeps them apart.
  await expect(accountInformationPage.cityInput).toHaveValue('Toronto');
  await expect(accountInformationPage.zipcodeInput).toHaveValue('M5H 2N2');
  await expect(accountInformationPage.mobileNumberInput).toHaveValue('4165550100');
  // Not submitted: still on the form, Create Account untouched.
  await expect(page).toHaveURL(/\/signup$/);
  await expect(accountInformationPage.createAccountButton).toBeEnabled();
});
