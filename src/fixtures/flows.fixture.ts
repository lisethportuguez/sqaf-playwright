import { expect } from '@playwright/test';
import type { AccountDetails, PaymentDetails, SignupIdentity } from '../pages';
import { test as pagesTest } from './pages.fixture';

/**
 * SQAF — User flows (Stage 4, ADR-0010 D4).
 *
 * Multi-page sequences that several scenarios repeat verbatim. Each flow is a
 * `test.step` with one sub-step per official action, so the report still
 * shows every step. Step titles never contain test data (no e-mail, no
 * password). Only flows repeated by three or more scenarios belong here;
 * everything else stays in the scenario.
 *
 *  - registerViaUi: TC1, TC14, TC15, TC23.
 *  - payOrder: TC14, TC15, TC16.
 */

/** What the registration form needs: identity plus account details (a `UserAccount` fits). */
export type UiRegistration = SignupIdentity & AccountDetails;

export interface UserFlows {
  /**
   * From the OPEN Signup / Login page to the home page with "Logged in as
   * <name>": signup, account information, "Account Created!", Continue.
   */
  registerViaUi(user: UiRegistration): Promise<void>;

  /**
   * From the OPEN payment page to the order confirmation: card details,
   * "Pay and Confirm Order", "Order Placed!". The card is never shown in a
   * step title.
   */
  payOrder(card: PaymentDetails): Promise<void>;
}

export interface FlowFixtures {
  readonly userFlows: UserFlows;
}

export const test = pagesTest.extend<FlowFixtures>({
  userFlows: async (
    { signupLoginPage, accountInformationPage, accountCreatedPage, homePage, paymentPage, orderPlacedPage },
    use,
  ) => {
    await use({
      async registerViaUi(user) {
        await pagesTest.step('Register a new user through the UI', async () => {
          await pagesTest.step('Start the signup with name and e-mail', async () => {
            await signupLoginPage.waitUntilReady();
            await expect(signupLoginPage.signupHeading).toBeVisible();
            await signupLoginPage.startSignup({ name: user.name, email: user.email });
          });
          await pagesTest.step('Fill the account information', async () => {
            await accountInformationPage.waitUntilReady();
            await accountInformationPage.fill(user);
          });
          await pagesTest.step('Create the account', async () => {
            await accountInformationPage.createAccount();
            await accountCreatedPage.waitUntilReady();
            await expect(accountCreatedPage.confirmation).toHaveText('Account Created!');
          });
          await pagesTest.step('Continue as the logged-in user', async () => {
            await accountCreatedPage.continue();
            await homePage.waitUntilReady();
            await expect(homePage.header.loggedInUser).toHaveText(`Logged in as ${user.name}`);
          });
        });
      },

      async payOrder(card) {
        await pagesTest.step('Pay the order', async () => {
          await pagesTest.step('Enter the payment details', async () => {
            await paymentPage.waitUntilReady();
            await paymentPage.pay(card);
          });
          // The SUT shows "Your order has been placed successfully!" only for an
          // instant before navigating: the order is verified on the confirmation page.
          await pagesTest.step('The order is confirmed', async () => {
            await orderPlacedPage.waitUntilReady();
            await expect(orderPlacedPage.confirmation).toHaveText('Order Placed!');
            await expect(orderPlacedPage.message).toBeVisible();
          });
        });
      },
    });
  },
});
