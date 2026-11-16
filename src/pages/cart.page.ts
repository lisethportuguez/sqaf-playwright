import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { CartTable, type CartItem } from './components/cart-table.component';
import { CheckoutModal } from './components/checkout-modal.component';

export type { CartItem } from './components/cart-table.component';

/**
 * SQAF — Cart page (`/view_cart`).
 *
 * SUT DOM (observed 2026-11-15): breadcrumb "Shopping Cart"; table
 * `#cart_info_table` whose `tbody tr` rows have `.cart_description` (name
 * link), `.cart_price`, `.cart_quantity` and `.cart_total` cells; the
 * "Cart is empty!" block is `#empty_cart`, hidden while there are items.
 * The table has no roles beyond the generic ones, hence CSS.
 *
 * Stage 4 (observed 2026-11-16): the rows come from `CartTable`, shared with
 * the checkout page. "Proceed To Checkout" is an `<a>` without href (no role
 * `link`), bound by jQuery: logged in, it opens `/checkout`; otherwise it
 * shows `#checkoutModal`.
 */
export class CartPage extends BasePage {
  protected readonly path = '/view_cart';

  readonly breadcrumb: Locator;
  readonly table: CartTable;
  readonly itemRows: Locator;
  readonly emptyCartMessage: Locator;
  readonly proceedToCheckoutButton: Locator;
  readonly checkoutModal: CheckoutModal;

  constructor(page: CartPage['page']) {
    super(page);
    this.breadcrumb = page.locator('.breadcrumbs').getByText('Shopping Cart', { exact: true });
    this.table = new CartTable(page.locator('#cart_info_table tbody tr'));
    this.itemRows = this.table.rows;
    this.emptyCartMessage = page.getByText('Cart is empty!', { exact: true });
    this.proceedToCheckoutButton = page.getByText('Proceed To Checkout', { exact: true });
    this.checkoutModal = new CheckoutModal(page.locator('#checkoutModal'));
  }

  /** Row at a zero-based position. */
  itemAt(position: number): CartItem {
    return this.table.itemAt(position);
  }

  /** Row whose product name is exactly `name`. */
  itemNamed(name: string): CartItem {
    return this.table.itemNamed(name);
  }

  /**
   * Removes the row of the product (jQuery + AJAX `/delete_cart/<id>`) and
   * waits until the SUT has removed it from the page. When the last row goes,
   * the SUT hides the table and shows "Cart is empty!".
   */
  async removeItem(name: string): Promise<void> {
    const item = this.itemNamed(name);
    await item.removeButton.click();
    await item.row.waitFor({ state: 'detached' });
  }

  /**
   * Clicks "Proceed To Checkout". Logged in, the SUT opens the checkout page
   * (wait for `CheckoutPage`); otherwise it shows `checkoutModal`.
   */
  async proceedToCheckout(): Promise<void> {
    await this.proceedToCheckoutButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.breadcrumb).toBeVisible();
  }
}
