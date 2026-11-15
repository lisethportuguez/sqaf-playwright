import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/** Locators of one row of the cart table. */
export interface CartItem {
  readonly row: Locator;
  readonly name: Locator;
  readonly price: Locator;
  readonly quantity: Locator;
  readonly total: Locator;
}

/**
 * SQAF — Cart page (`/view_cart`).
 *
 * SUT DOM (observed 2026-11-15): breadcrumb "Shopping Cart"; table
 * `#cart_info_table` whose `tbody tr` rows have `.cart_description` (name
 * link), `.cart_price`, `.cart_quantity` and `.cart_total` cells; the
 * "Cart is empty!" block is `#empty_cart`, hidden while there are items.
 * The table has no roles beyond the generic ones, hence CSS.
 */
export class CartPage extends BasePage {
  protected readonly path = '/view_cart';

  readonly breadcrumb: Locator;
  readonly itemRows: Locator;
  readonly emptyCartMessage: Locator;

  constructor(page: CartPage['page']) {
    super(page);
    this.breadcrumb = page.locator('.breadcrumbs').getByText('Shopping Cart', { exact: true });
    this.itemRows = page.locator('#cart_info_table tbody tr');
    this.emptyCartMessage = page.getByText('Cart is empty!', { exact: true });
  }

  /** Row at a zero-based position. */
  itemAt(position: number): CartItem {
    return this.cartItem(this.itemRows.nth(position));
  }

  /** Row whose product name is exactly `name`. */
  itemNamed(name: string): CartItem {
    return this.cartItem(
      this.itemRows.filter({
        has: this.page.locator('.cart_description').getByRole('link', { name, exact: true }),
      }),
    );
  }

  private cartItem(row: Locator): CartItem {
    return {
      row,
      name: row.locator('.cart_description').getByRole('link'),
      price: row.locator('.cart_price'),
      quantity: row.locator('.cart_quantity'),
      total: row.locator('.cart_total'),
    };
  }

  protected async assertReady(): Promise<void> {
    await expect(this.breadcrumb).toBeVisible();
  }
}
