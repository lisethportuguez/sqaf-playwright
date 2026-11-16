import { cartLine, cartLineTexts, expect, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC13 — Verify Product quantity in Cart (official test case). No account.
 *
 * The official case sets the quantity to 4 on the product detail page and
 * expects exactly that quantity in the cart.
 */
const tc = scenario('TC13');
const QUANTITY = 4;
const line = cartLine(testData.products.byId(3), QUANTITY);

test(tc.title, tc.details, async ({ homePage, productDetailsPage, cartPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('View the product from the home page: its detail page opens', async () => {
    await homePage.productGrid.productNamed(line.product.name).openDetails();
    await productDetailsPage.waitUntilReady();
    await expect(productDetailsPage.productName).toHaveText(line.product.name);
  });

  await test.step(`Set the quantity to ${QUANTITY} and add to cart`, async () => {
    await productDetailsPage.addToCart(QUANTITY);
    await expect(productDetailsPage.quantityInput).toHaveValue(String(QUANTITY));
    await expect(productDetailsPage.cartModal.confirmationMessage).toBeVisible();
  });

  await test.step('View the cart: the product has exactly that quantity', async () => {
    await productDetailsPage.cartModal.viewCart();
    await cartPage.waitUntilReady();
    const texts = cartLineTexts(line);
    const item = cartPage.itemNamed(line.product.name);
    await expect(cartPage.itemRows).toHaveCount(1);
    await expect(item.quantity).toHaveText(texts.quantity);
    await expect(item.price).toHaveText(texts.price);
    await expect(item.total).toHaveText(texts.total);
  });
});
