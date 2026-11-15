import type { Locator } from '@playwright/test';

/**
 * SQAF — Confirmation modal shown after "Add to cart" (Stage 2).
 *
 * SUT DOM (observed 2026-11-15): `#cartModal` with title "Added!", the text
 * "Your product has been added to cart.", a "View Cart" link and a
 * "Continue Shopping" button. No business verification here (D3).
 */
export class CartModal {
  readonly title: Locator;
  readonly confirmationMessage: Locator;
  readonly viewCartLink: Locator;
  readonly continueShoppingButton: Locator;

  constructor(readonly root: Locator) {
    this.title = root.getByRole('heading', { name: 'Added!', exact: true });
    this.confirmationMessage = root.getByText('Your product has been added to cart.', { exact: true });
    this.viewCartLink = root.getByRole('link', { name: 'View Cart', exact: true });
    this.continueShoppingButton = root.getByRole('button', { name: 'Continue Shopping', exact: true });
  }

  async continueShopping(): Promise<void> {
    await this.continueShoppingButton.click();
  }

  async viewCart(): Promise<void> {
    await this.viewCartLink.click();
  }
}
