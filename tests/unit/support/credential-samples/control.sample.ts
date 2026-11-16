import { expect, test } from '@playwright/test';

/**
 * CONTROL (no SQAF fixtures): a password typed with `fill` and sent in an API
 * form under the general policy. The artifact scanner MUST find it, which
 * proves that the scanner can detect a leak.
 */
test('raw fill and API form under the general policy', async ({ page, request }) => {
  const secret = process.env['SAMPLE_CONTROL_SECRET'] ?? '';
  await request.fetch('/api/createAccount', { method: 'POST', form: { email: 'sqaf.control@example.com', password: secret } });
  await page.goto('/login');
  await page.getByTestId('login-password').fill(secret);
  await expect(page.getByText('Logged in as')).toBeVisible();
});
