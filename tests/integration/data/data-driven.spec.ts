import { caseTitle, expect, test, testData } from '@sqaf/fixtures';

/**
 * Stage 3 — Data-Driven Testing against the SUT (ADR-0009).
 *
 * One test body, many datasets: Playwright generates one test per JSON case
 * at collection time. Adding a case to the JSON file adds a test; no scenario
 * logic is duplicated. No account is created.
 */

test.describe('invalid credentials (users/invalid-credentials.json)', () => {
  for (const credentials of testData.invalidCredentials.all()) {
    test(caseTitle('rejects an invalid login', credentials), async ({ signupLoginPage }) => {
      await signupLoginPage.open();
      await signupLoginPage.login(credentials);

      await expect(signupLoginPage.loginError).toHaveText(credentials.expectedError);
      await expect(signupLoginPage.header.loggedInUser).toBeHidden();
    });
  }
});

test.describe('product search (products/search-terms.json)', () => {
  for (const search of testData.productSearches.all()) {
    test(caseTitle('search returns exactly the expected products', search), async ({ productsPage }) => {
      await productsPage.open();
      await productsPage.search(search.term);

      await expect(productsPage.searchedProductsHeading).toBeVisible();
      await expect(productsPage.productCards).toHaveCount(search.expectedProducts.length);
      for (const name of search.expectedProducts) {
        await expect(productsPage.productNamed(name).name).toHaveText(name);
      }
    });
  }
});
