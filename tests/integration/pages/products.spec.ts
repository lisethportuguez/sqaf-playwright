import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 2 — Product Page Objects and reusable components against the SUT.
 */

test('the products page lists products as reusable cards', async ({ productsPage }) => {
  await productsPage.open();

  await expect(productsPage.allProductsHeading).toBeVisible();
  await expect(productsPage.productCards).not.toHaveCount(0);
  // ProductsPage builds ProductCard components for any product.
  const first = productsPage.productAt(0);
  expect(first.constructor.name).toBe('ProductCard');
  await expect(first.name).not.toBeEmpty();
  await expect(first.price).toHaveText(/^Rs\. \d+$/);
});

test('ProductCard is reused for different products', async ({ productsPage }) => {
  await productsPage.open();

  const cards = [productsPage.productNamed('Blue Top'), productsPage.productNamed('Men Tshirt')];
  expect(Object.getPrototypeOf(cards[0])).toBe(Object.getPrototypeOf(cards[1]));
  await expect(cards[0]!.name).toHaveText('Blue Top');
  await expect(cards[1]!.name).toHaveText('Men Tshirt');
  await expect(cards[0]!.viewProductLink).toHaveAttribute('href', /^\/product_details\/\d+$/);
  await expect(cards[1]!.viewProductLink).toHaveAttribute('href', /^\/product_details\/\d+$/);
});

test('a product card opens the product detail page', async ({ page, productsPage, productDetailsPage }) => {
  await productsPage.open();
  await productsPage.productAt(0).openDetails();
  await productDetailsPage.waitUntilReady();

  await expect(page).toHaveURL(/\/product_details\/\d+$/);
  await expect(productDetailsPage.productName).not.toBeEmpty();
  await expect(productDetailsPage.category).toBeVisible();
  await expect(productDetailsPage.price).toBeVisible();
  await expect(productDetailsPage.availability).toBeVisible();
  await expect(productDetailsPage.condition).toBeVisible();
  await expect(productDetailsPage.brand).toBeVisible();
});

test('searching "Jeans" shows only matching products', async ({ page, productsPage }) => {
  const term = 'Jeans';
  await productsPage.open();
  await productsPage.search(term);

  await expect(page).toHaveURL(/\/products\?search=Jeans$/);
  await expect(productsPage.searchedProductsHeading).toBeVisible();
  const count = await productsPage.productCards.count();
  expect(count).toBeGreaterThan(0);
  for (let position = 0; position < count; position++) {
    await expect(productsPage.productAt(position).name).toContainText(term);
  }
});

test('the header is reused by every page and drives navigation', async ({
  page,
  homePage,
  productsPage,
  cartPage,
  signupLoginPage,
}) => {
  const headers = [homePage.header, productsPage.header, cartPage.header, signupLoginPage.header];
  for (const header of headers) expect(header.constructor.name).toBe('HeaderComponent');

  await homePage.open();
  await homePage.header.goToProducts();
  await productsPage.waitUntilReady();
  await expect(page).toHaveURL(/\/products$/);

  await productsPage.header.goToCart();
  await cartPage.waitUntilReady();
  await expect(page).toHaveURL(/\/view_cart$/);

  await cartPage.header.goToSignupLogin();
  await signupLoginPage.waitUntilReady();
  await expect(page).toHaveURL(/\/login$/);

  await signupLoginPage.header.goToHome();
  await homePage.waitUntilReady();
});
