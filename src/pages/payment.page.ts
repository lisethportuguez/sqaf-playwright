import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { fillSecret } from './components/secret-field';

/** Card data the payment form needs (ADR-0007 D9: structural input type). */
export interface PaymentDetails {
  readonly nameOnCard: string;
  readonly cardNumber: string;
  readonly cvc: string;
  readonly expiryMonth: string;
  readonly expiryYear: string;
}

/**
 * SQAF — Payment page (`/payment`, Stage 4).
 *
 * SUT DOM (observed 2026-11-16): heading "Payment" and a form with `data-qa`
 * fields (`name-on-card`, `card-number`, `cvc`, `expiry-month`,
 * `expiry-year`) and the `pay-button` "Pay and Confirm Order". On submit the
 * SUT un-hides "Your order has been placed successfully!" for an instant and
 * navigates to `/payment_done/<amount>`: the order is verified on that page
 * (`OrderPlacedPage`), not on the transient message.
 *
 * The card is fictitious (test-data/checkout/payment-cards.json). Its number
 * and CVC are still written with `fillSecret`, so no card value appears in a
 * step title of the report.
 */
export class PaymentPage extends BasePage {
  protected readonly path = '/payment';

  readonly heading: Locator;
  readonly nameOnCardInput: Locator;
  readonly cardNumberInput: Locator;
  readonly cvcInput: Locator;
  readonly expiryMonthInput: Locator;
  readonly expiryYearInput: Locator;
  readonly payButton: Locator;

  constructor(page: PaymentPage['page']) {
    super(page);
    this.heading = page.getByRole('heading', { name: 'Payment', exact: true });
    this.nameOnCardInput = page.getByTestId('name-on-card');
    this.cardNumberInput = page.getByTestId('card-number');
    this.cvcInput = page.getByTestId('cvc');
    this.expiryMonthInput = page.getByTestId('expiry-month');
    this.expiryYearInput = page.getByTestId('expiry-year');
    this.payButton = page.getByTestId('pay-button');
  }

  /** Fills the card and clicks "Pay and Confirm Order". */
  async pay(card: PaymentDetails): Promise<void> {
    await this.nameOnCardInput.fill(card.nameOnCard);
    await fillSecret(this.cardNumberInput, card.cardNumber);
    await fillSecret(this.cvcInput, card.cvc);
    await this.expiryMonthInput.fill(card.expiryMonth);
    await this.expiryYearInput.fill(card.expiryYear);
    await this.payButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
