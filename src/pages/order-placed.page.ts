import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SQAF — Order confirmation (`/payment_done/<amount>`, Stage 4). Reached only
 * by paying an order.
 *
 * SUT DOM (observed 2026-11-16): `data-qa="order-placed"` "Order Placed!",
 * the text "Congratulations! Your order has been confirmed!", a
 * "Download Invoice" link and `data-qa="continue-button"`.
 */
export class OrderPlacedPage extends BasePage {
  protected readonly path = undefined;

  readonly confirmation: Locator;
  readonly message: Locator;
  readonly downloadInvoiceLink: Locator;
  readonly continueButton: Locator;

  constructor(page: OrderPlacedPage['page']) {
    super(page);
    this.confirmation = page.getByTestId('order-placed');
    this.message = page.getByText('Congratulations! Your order has been confirmed!', { exact: true });
    this.downloadInvoiceLink = page.getByRole('link', { name: 'Download Invoice', exact: true });
    this.continueButton = page.getByTestId('continue-button');
  }

  async continue(): Promise<void> {
    await this.continueButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.confirmation).toBeVisible();
  }
}
