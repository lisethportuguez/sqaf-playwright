import type { TestDetails } from '@playwright/test';

/**
 * SQAF — Catalog of the functional scenarios (Stage 4). See ADR-0010.
 *
 * The 15 approved scenarios, with their OFFICIAL Automation Exercise number
 * and name (https://automationexercise.com/test_cases). It is the single
 * source of the title, tags and traceability annotations of every suite in
 * `tests/e2e`; tests/unit/e2e/traceability.spec.ts checks that the suites
 * follow it. Adding a scenario requires authorization (ADR-0010 D1).
 */

export type ScenarioArea = 'authentication' | 'products' | 'checkout';

/** Delivery block of Stage 4. */
export type ScenarioBlock = 'E4.1' | 'E4.2' | 'E4.3';

export interface ScenarioDefinition {
  /** Official number (TC<n>). */
  readonly number: number;
  /** Official name, verbatim. */
  readonly name: string;
  readonly area: ScenarioArea;
  readonly block: ScenarioBlock;
  /** Part of the `@smoke` selection (critical path with a small SUT cost). */
  readonly smoke: boolean;
  /** Creates an account in the SUT (`@account`): uses `testUser` or `newUserData`. */
  readonly account: boolean;
  /** Full title of the equivalent Stage 0 baseline test (experimental pair, Stage 7). */
  readonly baselinePair?: string;
  /**
   * Test timeout in ms when the scenario needs more than the global 30 s
   * (ADR-0010 D11): only the checkout scenarios, which register or log in,
   * order and delete the account in one test. Applied by the spec with
   * `test.setTimeout(tc.timeout)`.
   */
  readonly timeout?: number;
}

const define = <T extends Record<string, ScenarioDefinition>>(catalog: T): Readonly<Record<keyof T, ScenarioDefinition>> => {
  for (const definition of Object.values(catalog)) Object.freeze(definition);
  return Object.freeze(catalog);
};

export const SCENARIOS = define({
  TC1: { number: 1, name: 'Register User', area: 'authentication', block: 'E4.1', smoke: false, account: true, baselinePair: 'TC1 - Register User › registers a new user through the UI' },
  TC2: { number: 2, name: 'Login User with correct email and password', area: 'authentication', block: 'E4.1', smoke: true, account: true },
  TC3: { number: 3, name: 'Login User with incorrect email and password', area: 'authentication', block: 'E4.1', smoke: true, account: false, baselinePair: 'TC3 - Login User with incorrect email and password' },
  TC4: { number: 4, name: 'Logout User', area: 'authentication', block: 'E4.1', smoke: false, account: true },
  TC5: { number: 5, name: 'Register User with existing email', area: 'authentication', block: 'E4.1', smoke: false, account: true },
  TC8: { number: 8, name: 'Verify All Products and product detail page', area: 'products', block: 'E4.2', smoke: true, account: false, baselinePair: 'TC8 - Verify All Products and product detail page' },
  TC9: { number: 9, name: 'Search Product', area: 'products', block: 'E4.2', smoke: true, account: false, baselinePair: 'TC9 - Search Product' },
  TC12: { number: 12, name: 'Add Products in Cart', area: 'products', block: 'E4.2', smoke: true, account: false, baselinePair: 'TC12 - Add Products in Cart' },
  TC13: { number: 13, name: 'Verify Product quantity in Cart', area: 'products', block: 'E4.2', smoke: false, account: false },
  TC17: { number: 17, name: 'Remove Products From Cart', area: 'products', block: 'E4.2', smoke: false, account: false },
  TC18: { number: 18, name: 'View Category Products', area: 'products', block: 'E4.2', smoke: false, account: false },
  TC14: { number: 14, name: 'Place Order: Register while Checkout', area: 'checkout', block: 'E4.3', smoke: false, account: true, timeout: 60_000 },
  TC15: { number: 15, name: 'Place Order: Register before Checkout', area: 'checkout', block: 'E4.3', smoke: false, account: true, timeout: 60_000 },
  TC16: { number: 16, name: 'Place Order: Login before Checkout', area: 'checkout', block: 'E4.3', smoke: true, account: true, timeout: 60_000 },
  TC23: { number: 23, name: 'Verify address details in checkout', area: 'checkout', block: 'E4.3', smoke: false, account: true, timeout: 60_000 },
});

/** ADR-0010 D11: TC1 (registration + deletion only) took 20.3 s locally; a checkout scenario adds about ten more page loads. */
export const CHECKOUT_TIMEOUT = 60_000;

export type ScenarioId = keyof typeof SCENARIOS;

/** Annotation types written on every scenario. */
export const TEST_CASE_ANNOTATION = 'sqaf-test-case';
export const BASELINE_PAIR_ANNOTATION = 'sqaf-baseline-pair';
export const OFFICIAL_TEST_CASES_URL = 'https://automationexercise.com/test_cases';

export interface Scenario {
  readonly id: ScenarioId;
  readonly definition: ScenarioDefinition;
  /** `TC<n>: <official name>`; the colon keeps `-g "TC1:"` from matching TC12. */
  readonly title: string;
  /** Test timeout when the scenario needs more than the global one (only checkout scenarios). */
  readonly timeout: number | undefined;
  /** Tags and annotations for `test(title, details, body)`. */
  readonly details: TestDetails;
}

/** Title, tags (`@regression`, `@smoke`, `@account`) and annotations of one scenario. */
export function scenario(id: ScenarioId): Scenario {
  const definition: ScenarioDefinition = SCENARIOS[id];
  const title = `${id}: ${definition.name}`;
  const tag = ['@regression', ...(definition.smoke ? ['@smoke'] : []), ...(definition.account ? ['@account'] : [])];
  const annotation = [
    { type: TEST_CASE_ANNOTATION, description: `${title} (${OFFICIAL_TEST_CASES_URL})` },
    ...(definition.baselinePair === undefined
      ? []
      : [{ type: BASELINE_PAIR_ANNOTATION, description: `baseline/baseline.spec.ts › ${definition.baselinePair}` }]),
  ];
  return Object.freeze({ id, definition, title, timeout: definition.timeout, details: Object.freeze({ tag, annotation }) });
}
