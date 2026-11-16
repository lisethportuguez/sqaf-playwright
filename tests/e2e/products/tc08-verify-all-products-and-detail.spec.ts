import { expect, formatPrice, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC8 — Verify All Products and product detail page (official test case;
 * baseline pair). No account is created.
 *
 * The expected details of the first product come from products/catalog.json.
 */
const tc = scenario('TC8');
const firstProduct = testData.products.byId(1);

test(tc.title, tc.details, async ({ homePage, productsPage, productDetailsPage }) => {
  await test.step('Open the home page', async () => {
    await homePage.open();
  });

  await test.step('Go to All Products: the product list is visible', async () => {
    await homePage.header.goToProducts();
    await productsPage.waitUntilReady();
    await expect(productsPage.page).toHaveURL(/\/products$/);
    await expect(productsPage.allProductsHeading).toBeVisible();
    await expect(productsPage.productAt(0).root).toBeVisible();
    await expect(productsPage.productAt(0).name).toHaveText(firstProduct.name);
  });

  await test.step('View the first product: its detail page opens', async () => {
    await productsPage.productAt(0).openDetails();
    await productDetailsPage.waitUntilReady();
    await expect(productDetailsPage.page).toHaveURL(new RegExp(`/product_details/${firstProduct.id}$`));
  });

  await test.step('The name, category, price, availability, condition and brand are visible', async () => {
    await expect(productDetailsPage.productName).toHaveText(firstProduct.name);
    await expect(productDetailsPage.category).toHaveText(`Category: ${firstProduct.category}`);
    await expect(productDetailsPage.price).toHaveText(formatPrice(firstProduct.price));
    await expect(productDetailsPage.availability).toBeVisible();
    await expect(productDetailsPage.condition).toBeVisible();
    await expect(productDetailsPage.brand).toHaveText(`Brand: ${firstProduct.brand}`);
  });
});
