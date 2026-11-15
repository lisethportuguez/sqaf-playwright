import type { Locator } from '@playwright/test';

/**
 * SQAF — One product of a product grid (Stage 2). Reusable for any product
 * and any grid (all products, search results): it only knows its own root.
 *
 * SUT DOM (observed 2026-11-15): `.product-image-wrapper` holds a visible
 * `.productinfo` block (price `h2`, name `p`, "Add to cart" `<a>` WITHOUT href,
 * hence no link role) and a hover `.product-overlay` with the same content.
 * Actions use `.productinfo` so that exactly one "Add to cart" matches. CSS
 * classes are used because the grid has no roles, labels or data-qa. The
 * "View Product" link name starts with an icon-font glyph (see HeaderComponent).
 */
export class ProductCard {
  readonly name: Locator;
  readonly price: Locator;
  readonly addToCartButton: Locator;
  readonly viewProductLink: Locator;

  constructor(readonly root: Locator) {
    const info = root.locator('.productinfo');
    this.name = info.locator('p');
    this.price = info.getByRole('heading', { level: 2 });
    this.addToCartButton = info.getByText('Add to cart', { exact: true });
    this.viewProductLink = root.getByRole('link', { name: /^\W*View Product$/ });
  }

  /** Hovers the card (as a user does) and adds the product to the cart. */
  async addToCart(): Promise<void> {
    await this.root.hover();
    await this.addToCartButton.click();
  }

  async openDetails(): Promise<void> {
    await this.viewProductLink.click();
  }
}
