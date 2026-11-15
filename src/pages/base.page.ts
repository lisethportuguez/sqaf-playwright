import type { Page } from '@playwright/test';
import { assertNoAntiBotChallenge } from '../errors/anti-bot-guard';
import { HeaderComponent } from './components/header.component';

/**
 * SQAF — Base of every Page Object (Stage 2). See ADR-0007 (D1).
 *
 * Holds ONLY what every page shares:
 *  - the Playwright `page` of the test (shared by all Page Objects of a test);
 *  - the common header (composition, D2);
 *  - `open()` and `waitUntilReady()`, the single navigation model.
 *
 * `waitUntilReady()` order is fixed:
 *  1. `load` event: Automation Exercise binds controls ("Add to cart",
 *     search) with jQuery when its scripts load; earlier clicks are ignored
 *     (Stage 0 finding). Condition-based wait, never a fixed sleep.
 *  2. anti-bot guard: fails with InfrastructureError if the SUT answered with
 *     a challenge page (ADR-0006). No retry, no evasion.
 *  3. `assertReady()`: the page's own technical readiness marker.
 */
export abstract class BasePage {
  readonly header: HeaderComponent;

  /**
   * Path relative to baseURL, or `undefined` for pages that are reached only
   * through a user flow (for example, the "Account Created" page).
   */
  protected abstract readonly path: string | undefined;

  constructor(readonly page: Page) {
    this.header = new HeaderComponent(page.getByRole('banner'));
  }

  /** Navigates directly to the page and waits until it is ready. */
  async open(): Promise<void> {
    if (this.path === undefined) {
      throw new Error(`${this.constructor.name} is reached through a user flow and cannot be opened directly.`);
    }
    await this.navigateTo(this.path);
  }

  /** Waits until the page is ready; also used after a navigation by click (D6). */
  async waitUntilReady(): Promise<void> {
    await this.page.waitForLoadState('load');
    await assertNoAntiBotChallenge(this.page);
    await this.assertReady();
  }

  /** Technical precondition of the page (not a business assertion, D3). */
  protected abstract assertReady(): Promise<void>;

  protected async navigateTo(path: string): Promise<void> {
    await this.page.goto(path);
    await this.waitUntilReady();
  }
}
