import { test as base } from '@playwright/test';
import { blockAds } from '../../config/ad-blocking';

/**
 * SQAF — Browser-context fixtures (Stage 2). See ADR-0007 and ADR-0002.
 *
 * `adBlocking` is AUTOMATIC: every SQAF test gets the exact ad-blocking policy
 * of the baseline (`config/ad-blocking.ts`, reused, not copied), registered on
 * the test's own browser context before the test body runs. The baseline
 * keeps its own `beforeEach` and never imports this module.
 */
export interface ContextFixtures {
  readonly adBlocking: void;
}

export const test = base.extend<ContextFixtures>({
  adBlocking: [
    async ({ context }, use) => {
      await blockAds(context);
      await use();
    },
    { auto: true },
  ],
});
