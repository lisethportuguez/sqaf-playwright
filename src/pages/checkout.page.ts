import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { AddressBlock } from './components/address-block.component';
import { CartTable } from './components/cart-table.component';

/**
 * SQAF — Checkout page (`/checkout`, Stage 4). Reached from the cart with a
 * logged-in user.
 *
 * SUT DOM (observed 2026-11-16): headings "Address Details" and "Review Your
 * Order"; `#address_delivery` and `#address_invoice` lists (ids are the only
 * way to tell them apart, hence CSS); the review table `#cart_info` with the
 * same product rows as the cart plus a last "Total Amount" row; a comment
 * textarea inside `#ordermsg` (its label has no "for"); and the
 * "Place Order" link to `/payment`.
 */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout';

  readonly addressDetailsHeading: Locator;
  readonly reviewOrderHeading: Locator;
  readonly deliveryAddress: AddressBlock;
  readonly billingAddress: AddressBlock;
  /** Product rows of "Review Your Order" (the "Total Amount" row is excluded). */
  readonly orderItems: CartTable;
  readonly totalAmount: Locator;
  readonly commentInput: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: CheckoutPage['page']) {
    super(page);
    this.addressDetailsHeading = page.getByRole('heading', { name: 'Address Details', exact: true });
    this.reviewOrderHeading = page.getByRole('heading', { name: 'Review Your Order', exact: true });
    this.deliveryAddress = new AddressBlock(page.locator('#address_delivery'));
    this.billingAddress = new AddressBlock(page.locator('#address_invoice'));
    const rows = page.locator('#cart_info tbody tr');
    this.orderItems = new CartTable(rows.filter({ has: page.locator('.cart_description') }));
    this.totalAmount = rows.filter({ hasText: 'Total Amount' }).locator('.cart_total_price');
    this.commentInput = page.locator('#ordermsg').getByRole('textbox');
    this.placeOrderButton = page.getByRole('link', { name: 'Place Order', exact: true });
  }

  /** Writes the order comment and goes to the payment page. */
  async placeOrder(comment: string): Promise<void> {
    await this.commentInput.fill(comment);
    await this.placeOrderButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.addressDetailsHeading).toBeVisible();
    await expect(this.reviewOrderHeading).toBeVisible();
  }
}
