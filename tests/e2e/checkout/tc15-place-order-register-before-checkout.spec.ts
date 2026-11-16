import {
  cartLine,
  cartLineTexts,
  cartTotal,
  CREDENTIAL_SAFE_EVIDENCE,
  expect,
  formatPrice,
  scenario,
  test,
  testData,
} from '@sqaf/fixtures';

/**
 * TC15 — Place Order: Register before Checkout (official test case).
 *
 * The user registers through the UI first (`newUserData`), then adds the
 * products, checks out and pays with the fictitious card. The account is
 * deleted through the UI; the fixture verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC15');
const lines = [cartLine(testData.products.byId(1)), cartLine(testData.products.byId(2))];
const card = testData.paymentCards.byId('test-visa');
const COMMENT = 'SQAF automated test order (fictitious data, no real purchase).';

test(tc.title, tc.details, async ({
  newUserData,
  homePage,
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
  });

  await userFlows.registerViaUi(newUserData);

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
