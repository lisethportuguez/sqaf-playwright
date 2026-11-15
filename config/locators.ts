/**
 * SQAF — Locator policy (Stage 2). See ADR-0007 (D4) and ADR-0005.
 *
 * Automation Exercise exposes `data-qa` attributes for automation on its
 * forms. Setting Playwright's `testIdAttribute` lets the Page Objects use
 * `getByTestId('login-email')` instead of raw CSS.
 *
 * Applies ONLY to the SQAF projects (`sqafUse`). The experimental baseline
 * keeps its Stage 0 `use` and its own `locator('[data-qa="..."]')` calls.
 */
export interface LocatorPolicy {
  readonly testIdAttribute: string;
}

export const SQAF_LOCATORS: LocatorPolicy = Object.freeze({
  testIdAttribute: 'data-qa',
});
