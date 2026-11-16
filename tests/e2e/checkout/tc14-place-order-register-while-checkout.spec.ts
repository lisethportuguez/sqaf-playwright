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
 * TC14 — Place Order: Register while Checkout (official test case).
 *
 * Products are added WITHOUT a user; the checkout asks to register, the user
 * registers through the UI (`newUserData`), and the cart must still hold the
 * same products and quantities. The order is paid with the fictitious card
 * of checkout/payment-cards.json and the account is deleted through the UI;
 * the fixture deletes it again if needed and verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC14');
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

  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Add the products to the cart', async () => {
    for (const line of lines) {
      await homePage.productGrid.productNamed(line.product.name).addToCart();
      await expect(homePage.cartModal.confirmationMessage).toBeVisible();
      await homePage.cartModal.continueShopping();
      await expect(homePage.cartModal.root).toBeHidden();
    }
  });

  await test.step('Open the cart and proceed to checkout: registration is required', async () => {
    await homePage.header.goToCart();
    await cartPage.waitUntilReady();
    await expect(cartPage.itemRows).toHaveCount(lines.length);
    await cartPage.proceedToCheckout();
    await expect(cartPage.checkoutModal.message).toBeVisible();
    await cartPage.checkoutModal.goToRegisterLogin();
  });

  await userFlows.registerViaUi(newUserData);

  await test.step('Back in the cart: the products and quantities are kept', async () => {
    await homePage.header.goToCart();
    await cartPage.waitUntilReady();
    await expect(cartPage.itemRows).toHaveCount(lines.length);
    for (const line of lines) {
      await expect(cartPage.itemNamed(line.product.name).quantity).toHaveText(cartLineTexts(line).quantity);
    }
  });

  await test.step('Proceed to checkout: address details and order review', async () => {
    await cartPage.proceedToCheckout();
    await checkoutPage.waitUntilReady();
    await expect(checkoutPage.orderItems.rows).toHaveCount(lines.length);
    for (const line of lines) {
      const item = checkoutPage.orderItems.itemNamed(line.product.name);
      const texts = cartLineTexts(line);
      await expect(item.quantity).toHaveText(texts.quantity);
      await expect(item.total).toHaveText(texts.total);
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
