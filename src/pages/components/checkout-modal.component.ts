import type { Locator } from '@playwright/test';

/**
 * SQAF — Modal shown by "Proceed To Checkout" without a logged-in user
 * (Stage 4, TC14).
 *
 * SUT DOM (observed 2026-11-16): `#checkoutModal` with the title "Checkout",
 * the text "Register / Login account to proceed on checkout.", a
 * "Register / Login" link to `/login` and a "Continue On Cart" button.
 */
export class CheckoutModal {
  readonly title: Locator;
  readonly message: Locator;
  readonly registerLoginLink: Locator;
  readonly continueOnCartButton: Locator;

  constructor(readonly root: Locator) {
    this.title = root.getByRole('heading', { name: 'Checkout', exact: true });
    this.message = root.getByText('Register / Login account to proceed on checkout.', { exact: true });
    this.registerLoginLink = root.getByRole('link', { name: 'Register / Login', exact: true });
    this.continueOnCartButton = root.getByRole('button', { name: 'Continue On Cart', exact: true });
  }

  async goToRegisterLogin(): Promise<void> {
    await this.registerLoginLink.click();
  }
}
