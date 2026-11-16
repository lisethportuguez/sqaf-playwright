import { expect, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC17 — Remove Products From Cart (official test case). No account.
 *
 * Two products are added from the home page; removing the first one leaves
 * only the second, and removing the second leaves the cart empty.
 */
const tc = scenario('TC17');
const products = [testData.products.byId(1), testData.products.byId(2)] as const;

test(tc.title, tc.details, async ({ homePage, cartPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Add two products to the cart', async () => {
    for (const product of products) {
      await homePage.productGrid.productNamed(product.name).addToCart();
      await expect(homePage.cartModal.confirmationMessage).toBeVisible();
      await homePage.cartModal.continueShopping();
      await expect(homePage.cartModal.root).toBeHidden();
    }
  });

  await test.step('Open the cart: both products are listed', async () => {
    await homePage.header.goToCart();
    await cartPage.waitUntilReady();
    await expect(cartPage.itemRows).toHaveCount(products.length);
  });

  await test.step('Remove the first product: only the second remains', async () => {
    await cartPage.removeItem(products[0].name);
    await expect(cartPage.itemNamed(products[0].name).row).toHaveCount(0);
    await expect(cartPage.itemRows).toHaveCount(1);
    await expect(cartPage.itemNamed(products[1].name).name).toHaveText(products[1].name);
  });

  await test.step('Remove the second product: the cart is empty', async () => {
    await cartPage.removeItem(products[1].name);
    await expect(cartPage.itemRows).toHaveCount(0);
    await expect(cartPage.emptyCartMessage).toBeVisible();
  });
});
