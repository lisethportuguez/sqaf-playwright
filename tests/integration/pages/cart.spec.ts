import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 2 — Cart Page Objects and the cart modal against the SUT.
 * The cart lives in the session of the test's own browser context.
 */

test('two products added from the grid are shown in the cart', async ({ productsPage, cartPage }) => {
  await productsPage.open();

  await productsPage.productNamed('Blue Top').addToCart();
  await expect(productsPage.cartModal.confirmationMessage).toBeVisible();
  await productsPage.cartModal.continueShopping();
  await expect(productsPage.cartModal.root).toBeHidden();

  await productsPage.productNamed('Men Tshirt').addToCart();
  await expect(productsPage.cartModal.confirmationMessage).toBeVisible();
  await productsPage.cartModal.viewCart();
  await cartPage.waitUntilReady();

  await expect(cartPage.itemRows).toHaveCount(2);
  const blueTop = cartPage.itemNamed('Blue Top');
  await expect(blueTop.price).toHaveText('Rs. 500');
  await expect(blueTop.quantity).toHaveText('1');
  await expect(blueTop.total).toHaveText('Rs. 500');
  const tshirt = cartPage.itemNamed('Men Tshirt');
  await expect(tshirt.price).toHaveText('Rs. 400');
  await expect(tshirt.quantity).toHaveText('1');
  await expect(tshirt.total).toHaveText('Rs. 400');
  await expect(cartPage.emptyCartMessage).toBeHidden();
});

test('a new test starts with an empty cart (no state shared between tests)', async ({ cartPage }) => {
  await cartPage.open();

  await expect(cartPage.itemRows).toHaveCount(0);
  await expect(cartPage.emptyCartMessage).toBeVisible();
});
