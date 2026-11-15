import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 2 — Fixtures layer. None of these tests contacts the SUT.
 */

test('every Page Object fixture is available and is the right Page Object', async ({
  homePage,
  signupLoginPage,
  accountInformationPage,
  accountCreatedPage,
  accountDeletedPage,
  productsPage,
  productDetailsPage,
  cartPage,
}) => {
  const created = {
    HomePage: homePage,
    SignupLoginPage: signupLoginPage,
    AccountInformationPage: accountInformationPage,
    AccountCreatedPage: accountCreatedPage,
    AccountDeletedPage: accountDeletedPage,
    ProductsPage: productsPage,
    ProductDetailsPage: productDetailsPage,
    CartPage: cartPage,
  };
  for (const [className, pageObject] of Object.entries(created)) {
    expect(pageObject.constructor.name, className).toBe(className);
    // Every Page Object shares the base navigation model (D1, D6).
    expect(typeof pageObject.open, className).toBe('function');
    expect(typeof pageObject.waitUntilReady, className).toBe('function');
  }
});

test('all Page Objects of a test wrap the same page of that test', async ({
  page,
  homePage,
  signupLoginPage,
  accountInformationPage,
  accountCreatedPage,
  accountDeletedPage,
  productsPage,
  productDetailsPage,
  cartPage,
}) => {
  for (const pageObject of [
    homePage,
    signupLoginPage,
    accountInformationPage,
    accountCreatedPage,
    accountDeletedPage,
    productsPage,
    productDetailsPage,
    cartPage,
  ]) {
    expect(pageObject.page).toBe(page);
  }
});

test('flow-only pages refuse to be opened directly', async ({
  accountInformationPage,
  accountCreatedPage,
  accountDeletedPage,
  productDetailsPage,
}) => {
  for (const pageObject of [accountInformationPage, accountCreatedPage, accountDeletedPage, productDetailsPage]) {
    await expect(pageObject.open()).rejects.toThrow(/is reached through a user flow and cannot be opened directly/);
  }
});

test('the ad-blocking policy is applied automatically to the test context', async ({ page }) => {
  // The request is aborted by the context route before reaching the network.
  await expect(page.goto('https://pagead2.googlesyndication.com/')).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);
});

/*
 * Isolation (D11): both tests have the SAME body and run in parallel and in any
 * order. Each must start with a fresh context (no cookie left by the other)
 * and leave a marker the other must never see.
 */
for (const name of ['A', 'B']) {
  test(`isolation ${name}: each test starts with a fresh browser context`, async ({ context, page }) => {
    expect(await context.cookies()).toEqual([]);
    expect(context.pages()).toEqual([page]);
    await context.addCookies([
      { name: 'sqaf-isolation', value: name, domain: 'automationexercise.com', path: '/' },
    ]);
    expect(await context.cookies()).toHaveLength(1);
  });
}
