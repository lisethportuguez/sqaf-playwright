/**
 * SQAF — Experimental BASELINE (Stage 0).
 *
 * Reference implementation of 5 Automation Exercise test cases written
 * WITHOUT the SQAF architecture: locators and data live inside each test,
 * no Page Objects, no custom fixtures. It exists only to be compared against
 * the equivalent SQAF implementation in Stage 7. Do not refactor it.
 *
 * Source of the scenarios: https://automationexercise.com/test_cases
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { blockAds } from '../config/ad-blocking';

test.beforeEach(async ({ context }) => {
  // Same ad-blocking policy as SQAF (ADR-0002). Not part of the scenario logic.
  await blockAds(context);
});

test.describe('TC1 - Register User', () => {
  // In-memory credentials, unique per execution. Never written to disk.
  let createdAccount: { email: string; password: string } | undefined;
  let deletedThroughUi = false;

  test.afterEach(async ({ request }) => {
    // Cleanup safety net: delete ONLY the account created by this execution,
    // and only if the scenario did not already delete it through the UI.
    if (!createdAccount || deletedThroughUi) return;
    await test.step('Cleanup: delete account via API', async () => {
      const response = await request.delete('/api/deleteAccount', {
        form: { email: createdAccount!.email, password: createdAccount!.password },
      });
      expect(response.ok()).toBeTruthy();
      expect(await response.json()).toMatchObject({ responseCode: 200 });
    });
  });

  test('registers a new user through the UI', async ({ page }) => {
    const name = 'SQAF Baseline';
    const email = `sqaf.baseline+${randomUUID()}@example.com`;
    const password = `Sqaf#${randomUUID()}`;

    await page.goto('/');
    await expect(page).toHaveTitle('Automation Exercise');

    await page.getByRole('link', { name: 'Signup / Login' }).click();
    await expect(page.getByRole('heading', { name: 'New User Signup!' })).toBeVisible();

    await page.locator('[data-qa="signup-name"]').fill(name);
    await page.locator('[data-qa="signup-email"]').fill(email);
    await page.locator('[data-qa="signup-button"]').click();
    await expect(page.getByText('Enter Account Information')).toBeVisible();

    await page.locator('#id_gender2').check();
    await page.locator('[data-qa="password"]').fill(password);
    await page.locator('[data-qa="days"]').selectOption('10');
    await page.locator('[data-qa="months"]').selectOption('5');
    await page.locator('[data-qa="years"]').selectOption('1995');
    await page.locator('#newsletter').check();
    await page.locator('#optin').check();
    await page.locator('[data-qa="first_name"]').fill('Ana');
    await page.locator('[data-qa="last_name"]').fill('Baseline');
    await page.locator('[data-qa="company"]').fill('SQAF');
    await page.locator('[data-qa="address"]').fill('Avenida Central 100');
    await page.locator('[data-qa="address2"]').fill('Edificio 2');
    await page.locator('[data-qa="country"]').selectOption('Canada');
    await page.locator('[data-qa="state"]').fill('Ontario');
    await page.locator('[data-qa="city"]').fill('Toronto');
    await page.locator('[data-qa="zipcode"]').fill('M5H 2N2');
    await page.locator('[data-qa="mobile_number"]').fill('4165550100');
    await page.locator('[data-qa="create-account"]').click();
    createdAccount = { email, password };

    await expect(page.locator('[data-qa="account-created"]')).toHaveText('Account Created!');
    await page.locator('[data-qa="continue-button"]').click();
    await expect(page.getByText(`Logged in as ${name}`)).toBeVisible();

    await page.getByRole('link', { name: 'Delete Account' }).click();
    await expect(page.locator('[data-qa="account-deleted"]')).toHaveText('Account Deleted!');
    deletedThroughUi = true;
    await page.locator('[data-qa="continue-button"]').click();
  });
});

test('TC3 - Login User with incorrect email and password', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Automation Exercise');

  await page.getByRole('link', { name: 'Signup / Login' }).click();
  await expect(page.getByRole('heading', { name: 'Login to your account' })).toBeVisible();

  await page.locator('[data-qa="login-email"]').fill(`sqaf.nonexistent+${randomUUID()}@example.com`);
  await page.locator('[data-qa="login-password"]').fill('WrongPassword123');
  await page.locator('[data-qa="login-button"]').click();

  await expect(page.getByText('Your email or password is incorrect!')).toBeVisible();
});

test('TC8 - Verify All Products and product detail page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Automation Exercise');

  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page).toHaveURL(/\/products$/);
  await expect(page.getByRole('heading', { name: 'All Products' })).toBeVisible();
  await expect(page.locator('.features_items .product-image-wrapper').first()).toBeVisible();

  await page.getByRole('link', { name: 'View Product' }).first().click();
  await expect(page).toHaveURL(/\/product_details\/\d+$/);

  const details = page.locator('.product-information');
  await expect(details.getByRole('heading', { level: 2 })).not.toBeEmpty();
  await expect(details.getByText(/Category:/)).toBeVisible();
  await expect(details.getByText(/Rs\. \d+/)).toBeVisible();
  await expect(details.getByText('Availability:')).toBeVisible();
  await expect(details.getByText('Condition:')).toBeVisible();
  await expect(details.getByText('Brand:')).toBeVisible();
});

test('TC9 - Search Product', async ({ page }) => {
  const searchTerm = 'Jeans';

  await page.goto('/');
  await expect(page).toHaveTitle('Automation Exercise');

  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page.getByRole('heading', { name: 'All Products' })).toBeVisible();
  // The search button is bound by jQuery once the page scripts load;
  // clicking earlier is silently ignored (observed 3/3 failures in Stage 0).
  await page.waitForLoadState('load');

  await page.locator('#search_product').fill(searchTerm);
  await page.locator('#submit_search').click();

  await expect(page.getByRole('heading', { name: 'Searched Products' })).toBeVisible();
  const resultNames = page.locator('.features_items .productinfo p');
  await expect(resultNames.first()).toBeVisible();
  for (const productName of await resultNames.allTextContents()) {
    expect(productName).toContain(searchTerm);
  }
});

test('TC12 - Add Products in Cart', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Automation Exercise');

  await page.getByRole('link', { name: 'Products' }).click();
  await expect(page.getByRole('heading', { name: 'All Products' })).toBeVisible();
  // "Add to cart" links are bound by jQuery once the page scripts load;
  // clicking earlier is silently ignored (observed 4/6 failures in Stage 0).
  await page.waitForLoadState('load');

  const products = page.locator('.features_items .product-image-wrapper');
  const cartModal = page.locator('#cartModal');

  await products.nth(0).hover();
  await products.nth(0).locator('.productinfo').getByText('Add to cart').click();
  await expect(cartModal.getByText('Your product has been added to cart.')).toBeVisible();
  await cartModal.getByRole('button', { name: 'Continue Shopping' }).click();
  await expect(cartModal).toBeHidden();

  await products.nth(1).hover();
  await products.nth(1).locator('.productinfo').getByText('Add to cart').click();
  await expect(cartModal.getByText('Your product has been added to cart.')).toBeVisible();
  await cartModal.getByRole('link', { name: 'View Cart' }).click();

  await expect(page).toHaveURL(/\/view_cart$/);
  const rows = page.locator('#cart_info_table tbody tr');
  await expect(rows).toHaveCount(2);

  await expect(rows.nth(0).locator('.cart_description')).toContainText('Blue Top');
  await expect(rows.nth(0).locator('.cart_price')).toHaveText('Rs. 500');
  await expect(rows.nth(0).locator('.cart_quantity')).toHaveText('1');
  await expect(rows.nth(0).locator('.cart_total')).toHaveText('Rs. 500');

  await expect(rows.nth(1).locator('.cart_description')).toContainText('Men Tshirt');
  await expect(rows.nth(1).locator('.cart_price')).toHaveText('Rs. 400');
  await expect(rows.nth(1).locator('.cart_quantity')).toHaveText('1');
  await expect(rows.nth(1).locator('.cart_total')).toHaveText('Rs. 400');
});
