import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 2 — BasePage readiness model, offline (no request reaches the SUT).
 *
 * The SUT binds "Add to cart" and the search button with jQuery on the `load`
 * event (Stage 0 finding), so waitUntilReady() must not resolve before `load`.
 * The served page holds `load` with an image whose response the test releases
 * explicitly; no fixed sleep decides the outcome.
 */
const HOME_WITH_SLOW_IMAGE = `<!doctype html><html><head><title>Automation Exercise</title></head>
<body><header><a href="/">Home</a></header><img src="/slow.png" alt=""></body></html>`;

test('waitUntilReady() waits for the load event before declaring the page ready', async ({ page, homePage }) => {
  let releaseImage!: () => void;
  const imageReleased = new Promise<void>((resolve) => (releaseImage = resolve));

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (route.request().isNavigationRequest()) {
      await route.fulfill({ contentType: 'text/html', body: HOME_WITH_SLOW_IMAGE });
    } else if (url.pathname === '/slow.png') {
      await imageReleased;
      await route.fulfill({ status: 404, body: '' });
    } else {
      await route.abort('blockedbyclient');
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  let ready = false;
  const readiness = homePage.waitUntilReady().then(() => (ready = true));

  // The DOM is complete and the title already matches, but `load` has not fired.
  await expect(page).toHaveTitle('Automation Exercise');
  expect(await page.evaluate(() => document.readyState)).not.toBe('complete');
  expect(ready).toBe(false);

  releaseImage();
  await readiness;
  expect(ready).toBe(true);
  expect(await page.evaluate(() => document.readyState)).toBe('complete');
});
