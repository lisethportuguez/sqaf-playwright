import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { fillSecret } from './components/secret-field';

/** Data the login form needs (D9: structural; E3 data will match it). */
export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/** Data the "New User Signup!" form needs. */
export interface SignupIdentity {
  readonly name: string;
  readonly email: string;
}

/**
 * SQAF — "Signup / Login" page (`/login`): login form and the first step of
 * the signup form.
 *
 * SUT DOM (observed 2026-11-15): inputs and buttons expose `data-qa`
 * (`login-email`, `login-password`, `login-button`, `signup-name`,
 * `signup-email`, `signup-button`) and have no labels (only placeholders).
 * The login error text was observed in Stage 0 (TC3).
 */
export class SignupLoginPage extends BasePage {
  protected readonly path = '/login';

  readonly loginHeading: Locator;
  readonly loginEmailInput: Locator;
  readonly loginPasswordInput: Locator;
  readonly loginButton: Locator;
  readonly loginError: Locator;

  readonly signupHeading: Locator;
  readonly signupNameInput: Locator;
  readonly signupEmailInput: Locator;
  readonly signupButton: Locator;

  constructor(page: SignupLoginPage['page']) {
    super(page);
    this.loginHeading = page.getByRole('heading', { name: 'Login to your account', exact: true });
    this.loginEmailInput = page.getByTestId('login-email');
    this.loginPasswordInput = page.getByTestId('login-password');
    this.loginButton = page.getByTestId('login-button');
    this.loginError = page.getByText('Your email or password is incorrect!', { exact: true });

    this.signupHeading = page.getByRole('heading', { name: 'New User Signup!', exact: true });
    this.signupNameInput = page.getByTestId('signup-name');
    this.signupEmailInput = page.getByTestId('signup-email');
    this.signupButton = page.getByTestId('signup-button');
  }

  async login(credentials: LoginCredentials): Promise<void> {
    await this.loginEmailInput.fill(credentials.email);
    // fillSecret: the password never appears in a step title (ADR-0009 D16).
    await fillSecret(this.loginPasswordInput, credentials.password);
    await this.loginButton.click();
  }

  /**
   * Submits the first signup step. It does NOT create an account: the SUT
   * then shows "Enter Account Information" (AccountInformationPage).
   */
  async startSignup(identity: SignupIdentity): Promise<void> {
    await this.signupNameInput.fill(identity.name);
    await this.signupEmailInput.fill(identity.email);
    await this.signupButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.loginHeading).toBeVisible();
    await expect(this.signupHeading).toBeVisible();
  }
}
