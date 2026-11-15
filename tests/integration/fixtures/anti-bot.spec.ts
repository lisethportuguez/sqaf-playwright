import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 2 — Anti-bot guard wired into BasePage (ADR-0006, ADR-0007).
 *
 * The challenge is SIMULATED: every request of the page is intercepted with
 * page.route(); documents get a local copy of the observed Cloudflare page and
 * everything else is aborted. No request reaches the real SUT.
 */
const CHALLENGE_PAGE = `<!doctype html><html><head><title>One moment, please...</title></head>
<body><h1>Please wait while your request is being verified...</h1></body></html>`;

const ORDINARY_PAGE = `<!doctype html><html><head><title>Something else</title></head>
<body><h1>Not the home page</h1></body></html>`;

function serveOffline(body: string) {
  return async ({ page }: { page: import('@playwright/test').Page }) => {
    await page.route('**/*', async (route) => {
      if (route.request().isNavigationRequest()) {
        await route.fulfill({ status: 403, contentType: 'text/html', body });
      } else {
        await route.abort('blockedbyclient');
      }
    });
  };
}

test.describe('when the SUT answers with the anti-bot challenge', () => {
  test.beforeEach(serveOffline(CHALLENGE_PAGE));

  test('open() fails with InfrastructureError classified as infrastructure/anti-bot-challenge', async ({
    homePage,
  }) => {
    const error: unknown = await homePage.open().then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toMatchObject({
      name: 'InfrastructureError',
      category: 'infrastructure',
      classification: 'infrastructure/anti-bot-challenge',
      url: 'https://automationexercise.com/',
    });
    expect((error as Error).message).toContain('[SQAF:infrastructure/anti-bot-challenge]');
  });

  test('waitUntilReady() after an in-app navigation fails the same way', async ({ page, productsPage }) => {
    await page.goto('/products');
    await expect(productsPage.waitUntilReady()).rejects.toMatchObject({
      name: 'InfrastructureError',
      classification: 'infrastructure/anti-bot-challenge',
    });
  });
});

test.describe('when the page is not a challenge', () => {
  test.beforeEach(serveOffline(ORDINARY_PAGE));

  test('open() fails as an ordinary readiness failure, never as infrastructure', async ({ homePage }) => {
    const error: unknown = await homePage.open().then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).not.toBe('InfrastructureError');
    expect((error as Error).message).not.toContain('[SQAF:');
    expect((error as Error).message).toContain('toHaveTitle');
  });
});
