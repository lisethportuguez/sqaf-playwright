import {
  cartLine,
  cartLineTexts,
  cartTotal,
  CREDENTIAL_SAFE_EVIDENCE,
  credentialsOf,
  expect,
  formatPrice,
  scenario,
  test,
  testData,
} from '@sqaf/fixtures';

/**
 * TC16 — Place Order: Login before Checkout (official test case).
 *
 * The account is created through the API (`testUser`); the user logs in
 * through the UI, adds the products, checks out and pays with the fictitious
 * card, then deletes the account through the UI. The fixture verifies that
 * the account no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC16');
const lines = [cartLine(testData.products.byId(1)), cartLine(testData.products.byId(2))];
const card = testData.paymentCards.byId('test-visa');
const COMMENT = 'SQAF automated test order (fictitious data, no real purchase).';

test(tc.title, tc.details, async ({
  testUser,
  homePage,
  signupLoginPage,
  cartPage,
  userFlows,
  checkoutPage,
  orderPlacedPage,
  accountDeletedPage,
}) => {
  test.setTimeout(tc.timeout!);

  await test.step('Open the home page and go to Signup / Login', async () => {
    await homePage.open();
    await homePage.header.goToSignupLogin();
    await signupLoginPage.waitUntilReady();
  });

  await test.step('Log in with the correct e-mail and password', async () => {
    await signupLoginPage.login(credentialsOf(testUser));
    await homePage.waitUntilReady();
    await expect(homePage.header.loggedInUser).toHaveText(`Logged in as ${testUser.name}`);
  });

  await test.step('Add the products to the cart', async () => {
    for (const line of lines) {
      await homePage.productGrid.productNamed(line.product.name).addToCart();
      await expect(homePage.cartModal.confirmationMessage).toBeVisible();
      await homePage.cartModal.continueShopping();
      await expect(homePage.cartModal.root).toBeHidden();
    }
  });

  await test.step('Open the cart and proceed to checkout', async () => {
    await homePage.header.goToCart();
    await cartPage.waitUntilReady();
    await expect(cartPage.itemRows).toHaveCount(lines.length);
    await cartPage.proceedToCheckout();
    await checkoutPage.waitUntilReady();
  });

  await test.step('Address details and order review', async () => {
    await expect(checkoutPage.deliveryAddress.heading).toHaveText('Your delivery address');
    await expect(checkoutPage.orderItems.rows).toHaveCount(lines.length);
    for (const line of lines) {
      await expect(checkoutPage.orderItems.itemNamed(line.product.name).total).toHaveText(cartLineTexts(line).total);
    }
    await expect(checkoutPage.totalAmount).toHaveText(formatPrice(cartTotal(lines)));
  });

  await test.step('Write a comment and place the order', async () => {
    await checkoutPage.placeOrder(COMMENT);
  });

  await userFlows.payOrder(card);

  await test.step('Delete the account through the UI', async () => {
    await orderPlacedPage.header.deleteAccount();
    await accountDeletedPage.waitUntilReady();
    await expect(accountDeletedPage.confirmation).toHaveText('Account Deleted!');
    await accountDeletedPage.continue();
  });
});
