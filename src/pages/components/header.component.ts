import type { Locator } from '@playwright/test';

/**
 * SQAF — Site header (Stage 2). Composed into every page by BasePage (D2).
 *
 * Navigation methods only click (D6): the test then asks for the destination
 * page fixture and calls `waitUntilReady()`.
 *
 * Observed in the SUT DOM (2026-11-15): Home, Products, Cart and
 * "Signup / Login" links. "Logged in as", "Delete Account" and "Logout" only
 * exist with a session: the first two were observed in Stage 0 (TC1); "Logout"
 * comes from the official test cases (TC4) and is not exercised in Stage 2,
 * which creates no accounts (D8).
 *
 * Each link starts with an icon-font glyph that is part of its accessible
 * name (a private-use character, then a space, then "Home"), so names are
 * matched with an anchored pattern that allows only non-word characters
 * before the visible text.
 */
export class HeaderComponent {
  readonly homeLink: Locator;
  readonly productsLink: Locator;
  readonly cartLink: Locator;
  readonly signupLoginLink: Locator;
  readonly logoutLink: Locator;
  readonly deleteAccountLink: Locator;
  readonly loggedInUser: Locator;

  constructor(readonly root: Locator) {
    this.homeLink = root.getByRole('link', { name: /^\W*Home$/ });
    this.productsLink = root.getByRole('link', { name: /^\W*Products$/ });
    this.cartLink = root.getByRole('link', { name: /^\W*Cart$/ });
    this.signupLoginLink = root.getByRole('link', { name: /^\W*Signup \/ Login$/ });
    this.logoutLink = root.getByRole('link', { name: /^\W*Logout$/ });
    this.deleteAccountLink = root.getByRole('link', { name: /^\W*Delete Account$/ });
    this.loggedInUser = root.getByText('Logged in as');
  }

  async goToHome(): Promise<void> {
    await this.homeLink.click();
  }

  async goToProducts(): Promise<void> {
    await this.productsLink.click();
  }

  async goToCart(): Promise<void> {
    await this.cartLink.click();
  }

  async goToSignupLogin(): Promise<void> {
    await this.signupLoginLink.click();
  }

  async logout(): Promise<void> {
    await this.logoutLink.click();
  }

  async deleteAccount(): Promise<void> {
    await this.deleteAccountLink.click();
  }
}
