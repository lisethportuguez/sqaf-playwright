import { test as base } from '@playwright/test';
import {
  AccountCreatedPage,
  AccountDeletedPage,
  AccountInformationPage,
  CartPage,
  CategoryProductsPage,
  CheckoutPage,
  HomePage,
  OrderPlacedPage,
  PaymentPage,
  ProductDetailsPage,
  ProductsPage,
  SignupLoginPage,
} from '../pages';

/**
 * SQAF — Page Object fixtures (Stage 2). See ADR-0007 (D5).
 *
 * One fixture per Page Object, no aggregate `app` object. Playwright creates a
 * fixture only when a test asks for it (lazy), and every Page Object of a test
 * wraps the SAME `page` of that test. Nothing is shared between tests (D11).
 * From Stage 3 these fixtures are where test data will be wired in (D9).
 */
export interface PageFixtures {
  readonly homePage: HomePage;
  readonly signupLoginPage: SignupLoginPage;
  readonly accountInformationPage: AccountInformationPage;
  readonly accountCreatedPage: AccountCreatedPage;
  readonly accountDeletedPage: AccountDeletedPage;
  readonly productsPage: ProductsPage;
  readonly productDetailsPage: ProductDetailsPage;
  readonly cartPage: CartPage;
  readonly categoryProductsPage: CategoryProductsPage;
  readonly checkoutPage: CheckoutPage;
  readonly paymentPage: PaymentPage;
  readonly orderPlacedPage: OrderPlacedPage;
}

export const test = base.extend<PageFixtures>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  signupLoginPage: async ({ page }, use) => {
    await use(new SignupLoginPage(page));
  },
  accountInformationPage: async ({ page }, use) => {
    await use(new AccountInformationPage(page));
  },
  accountCreatedPage: async ({ page }, use) => {
    await use(new AccountCreatedPage(page));
  },
  accountDeletedPage: async ({ page }, use) => {
    await use(new AccountDeletedPage(page));
  },
  productsPage: async ({ page }, use) => {
    await use(new ProductsPage(page));
  },
  productDetailsPage: async ({ page }, use) => {
    await use(new ProductDetailsPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  categoryProductsPage: async ({ page }, use) => {
    await use(new CategoryProductsPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  paymentPage: async ({ page }, use) => {
    await use(new PaymentPage(page));
  },
  orderPlacedPage: async ({ page }, use) => {
    await use(new OrderPlacedPage(page));
  },
});
