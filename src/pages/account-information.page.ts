import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Data the "Enter Account Information" form needs (D9: structural interface;
 * the Stage 3 data layer will provide compatible objects through fixtures).
 */
export interface AccountDetails {
  readonly title: 'Mr' | 'Mrs';
  readonly password: string;
  /** Values of the day/month/year `<select>` options, for example '10', '5', '1995'. */
  readonly birthDate: { readonly day: string; readonly month: string; readonly year: string };
  readonly newsletter: boolean;
  readonly specialOffers: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string;
  readonly address: string;
  readonly address2?: string;
  /** Visible option of the country `<select>`, for example 'Canada'. */
  readonly country: string;
  readonly state: string;
  readonly city: string;
  readonly zipcode: string;
  readonly mobileNumber: string;
}

/**
 * SQAF — "Enter Account Information" (second signup step, `/signup`).
 *
 * Reached only after SignupLoginPage.startSignup(), so it is not opened
 * directly. Text fields use `data-qa` on purpose: the visible label
 * "Zipcode" points to `for="city"` (Stage 0 finding), so labels are not a
 * reliable description of these fields. The title radios and the two
 * checkboxes have correct labels and use their accessible names.
 *
 * `fill()` never submits; `createAccount()` creates a REAL account and is not
 * used in Stage 2 (D8): account provisioning and cleanup belong to Stage 3.
 */
export class AccountInformationPage extends BasePage {
  protected readonly path = undefined;

  readonly heading: Locator;
  readonly mrRadio: Locator;
  readonly mrsRadio: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly birthDaySelect: Locator;
  readonly birthMonthSelect: Locator;
  readonly birthYearSelect: Locator;
  readonly newsletterCheckbox: Locator;
  readonly specialOffersCheckbox: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly companyInput: Locator;
  readonly addressInput: Locator;
  readonly address2Input: Locator;
  readonly countrySelect: Locator;
  readonly stateInput: Locator;
  readonly cityInput: Locator;
  readonly zipcodeInput: Locator;
  readonly mobileNumberInput: Locator;
  readonly createAccountButton: Locator;

  constructor(page: AccountInformationPage['page']) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Enter Account Information', exact: true });
    this.mrRadio = page.getByRole('radio', { name: 'Mr.', exact: true });
    this.mrsRadio = page.getByRole('radio', { name: 'Mrs.', exact: true });
    this.nameInput = page.getByTestId('name');
    this.emailInput = page.getByTestId('email');
    this.passwordInput = page.getByTestId('password');
    this.birthDaySelect = page.getByTestId('days');
    this.birthMonthSelect = page.getByTestId('months');
    this.birthYearSelect = page.getByTestId('years');
    this.newsletterCheckbox = page.getByRole('checkbox', { name: 'Sign up for our newsletter!', exact: true });
    this.specialOffersCheckbox = page.getByRole('checkbox', {
      name: 'Receive special offers from our partners!',
      exact: true,
    });
    this.firstNameInput = page.getByTestId('first_name');
    this.lastNameInput = page.getByTestId('last_name');
    this.companyInput = page.getByTestId('company');
    this.addressInput = page.getByTestId('address');
    this.address2Input = page.getByTestId('address2');
    this.countrySelect = page.getByTestId('country');
    this.stateInput = page.getByTestId('state');
    this.cityInput = page.getByTestId('city');
    this.zipcodeInput = page.getByTestId('zipcode');
    this.mobileNumberInput = page.getByTestId('mobile_number');
    this.createAccountButton = page.getByTestId('create-account');
  }

  /** Fills the whole form WITHOUT submitting it. */
  async fill(details: AccountDetails): Promise<void> {
    await (details.title === 'Mr' ? this.mrRadio : this.mrsRadio).check();
    await this.passwordInput.fill(details.password);
    await this.birthDaySelect.selectOption(details.birthDate.day);
    await this.birthMonthSelect.selectOption(details.birthDate.month);
    await this.birthYearSelect.selectOption(details.birthDate.year);
    await this.newsletterCheckbox.setChecked(details.newsletter);
    await this.specialOffersCheckbox.setChecked(details.specialOffers);
    await this.firstNameInput.fill(details.firstName);
    await this.lastNameInput.fill(details.lastName);
    await this.companyInput.fill(details.company ?? '');
    await this.addressInput.fill(details.address);
    await this.address2Input.fill(details.address2 ?? '');
    await this.countrySelect.selectOption(details.country);
    await this.stateInput.fill(details.state);
    await this.cityInput.fill(details.city);
    await this.zipcodeInput.fill(details.zipcode);
    await this.mobileNumberInput.fill(details.mobileNumber);
  }

  /** Submits the form: creates a REAL account in the SUT. Not used in Stage 2 (D8). */
  async createAccount(): Promise<void> {
    await this.createAccountButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
