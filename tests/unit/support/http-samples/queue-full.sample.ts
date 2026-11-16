import { expect, test } from '@sqaf/fixtures';

/**
 * Reproduces CI run 43799046248 against a fake SUT: the login POST is answered
 * with HTTP 503 and a "queue full" page (no standard reason phrase). The
 * fake server decides by the e-mail of the form. The passwords are not secrets.
 */
test('queue full: the login POST is answered with HTTP 503', async ({ signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login({ email: 'sqaf.queue-full@example.com', password: 'not-a-secret' });
  await expect(signupLoginPage.loginError).toBeVisible();
});

test('control: the login POST is answered with HTTP 200 and no error message', async ({ signupLoginPage }) => {
  await signupLoginPage.open();
  await signupLoginPage.login({ email: 'sqaf.healthy@example.com', password: 'not-a-secret' });
  await expect(signupLoginPage.loginError).toBeVisible();
});

test('control: a locator timeout on a healthy page', async ({ signupLoginPage, page }) => {
  await signupLoginPage.open();
  await page.getByRole('link', { name: 'Missing link' }).click();
});

test('passing: no HTTP evidence is attached', async ({ signupLoginPage }) => {
  await signupLoginPage.open();
});

test('control: a healthy page whose image and iframe are answered with HTTP 503', async ({ page }) => {
  await page.goto('/healthy-broken-assets');
  await expect(page.getByText('Present')).toBeVisible();
  await expect(page.getByText('Never shown')).toBeVisible();
});
