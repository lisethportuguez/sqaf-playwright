import { caseTitle, expect, scenario, test, testData } from '@sqaf/fixtures';

/**
 * TC9 — Search Product (official test case; baseline pair). No account.
 *
 * Data-driven: one test per case of products/search-terms.json, each with
 * the exact products the term must return. The baseline searches "Jeans":
 * its equivalent case is [jeans].
 */
const tc = scenario('TC9');

for (const search of testData.productSearches.all()) {
  test(caseTitle(tc.title, search), tc.details, async ({ homePage, productsPage }) => {
    await test.step('Open the home page', async () => {
      await homePage.open();
    });

    await test.step('Go to All Products', async () => {
      await homePage.header.goToProducts();
      await productsPage.waitUntilReady();
      await expect(productsPage.allProductsHeading).toBeVisible();
    });

    await test.step('Search the term: "Searched Products" is visible', async () => {
      await productsPage.search(search.term);
      await expect(productsPage.searchedProductsHeading).toBeVisible();
    });

    await test.step('Exactly the products related to the term are visible', async () => {
      await expect(productsPage.productCards).toHaveCount(search.expectedProducts.length);
      for (const name of search.expectedProducts) {
        await expect(productsPage.productNamed(name).name).toHaveText(name);
      }
    });
  });
}
