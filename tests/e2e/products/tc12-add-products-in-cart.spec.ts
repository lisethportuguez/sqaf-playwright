import { cartLine, cartLineTexts, expect, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC12 — Add Products in Cart (official test case; baseline pair). No account.
 *
 * The first two products of the grid, with their expected prices from
 * products/catalog.json; each one is added once.
 */
const tc = scenario('TC12');
const lines = [cartLine(testData.products.byId(1)), cartLine(testData.products.byId(2))];

test(tc.title, tc.details, async ({ homePage, productsPage, cartPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Go to All Products', async () => {
    await homePage.header.goToProducts();
    await productsPage.waitUntilReady();
    await expect(productsPage.allProductsHeading).toBeVisible();
  });

  for (const [position, line] of lines.entries()) {
    const last = position === lines.length - 1;
    await test.step(`Add product ${position + 1} of the grid${last ? ' and view the cart' : ' and continue shopping'}`, async () => {
      const card = productsPage.productAt(position);
      await expect(card.name).toHaveText(line.product.name);
      await card.addToCart();
      await expect(productsPage.cartModal.confirmationMessage).toBeVisible();
      if (last) {
        await productsPage.cartModal.viewCart();
        await cartPage.waitUntilReady();
      } else {
        await productsPage.cartModal.continueShopping();
        await expect(productsPage.cartModal.root).toBeHidden();
      }
    });
  }

  await test.step('Both products are in the cart with their price, quantity and total', async () => {
    await expect(cartPage.itemRows).toHaveCount(lines.length);
    for (const line of lines) {
      const item = cartPage.itemNamed(line.product.name);
      const texts = cartLineTexts(line);
      await expect(item.name).toHaveText(line.product.name);
      await expect(item.price).toHaveText(texts.price);
      await expect(item.quantity).toHaveText(texts.quantity);
      await expect(item.total).toHaveText(texts.total);
    }
  });
});
