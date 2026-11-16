import { expect, test } from '@sqaf/fixtures';

/**
 * Sample (fake SUT only) of tests/integration/pages/products.spec.ts: no
 * account, no form. Its output folder IS selected by the upload paths of ci.yml
 * (failure evidence: screenshot, trace, video and error context).
 */
test('products: a passing check', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'All Products' })).toBeVisible();
});

test('products: a failing check whose evidence is published', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Missing heading' })).toBeVisible();
});
