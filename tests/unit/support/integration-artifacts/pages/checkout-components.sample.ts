import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@sqaf/fixtures';

/**
 * Sample (fake SUT only) of tests/integration/pages/checkout-components.spec.ts:
 * a card number typed with a plain `fill` under the general evidence policy,
 * so the trace records it. Its output folder is NOT in the published paths of
 * ci.yml.
 */
const CARDS = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', '..', '..', 'test-data', 'checkout', 'payment-cards.json'), 'utf8')) as {
  items: ReadonlyArray<{ cardNumber: string }>;
};

test('payment form: the check fails with a card number in the form', async ({ page }) => {
  await page.goto('/payment');
  await page.getByTestId('card-number').fill(CARDS.items[0]!.cardNumber);
  await expect(page.getByRole('heading', { name: 'Order Placed!' })).toBeVisible();
});
