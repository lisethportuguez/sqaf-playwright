/**
 * SQAF — Allure Report policy (Stage 6, Phase 2). See ADR-0011.
 *
 * Allure is a VIEW of the SQAF results: the failure classification and the
 * safe run summary stay the official records (ADR-0006, ADR-0010). Raw Allure
 * results are never published or used to build a report: the SQAF pipeline
 * prepares a sanitized copy, scans it, generates the report and scans the
 * report again, fail-closed (src/reporting/allure/).
 */
export interface AllurePolicy {
  /** Raw results written by allure-playwright for ONE run (local only, never published). */
  readonly rawResultsDir: string;
  /** Sanitized and scanned results: the ONLY input of `allure generate`. */
  readonly safeResultsDir: string;
  readonly reportDir: string;
  /** Run history (Allure 3 JSON lines), appended by every generated report. */
  readonly historyFile: string;
  readonly configFile: string;
  /** Pipeline outcome without any value; CI fails when it is not safe. */
  readonly statusFile: string;
  /**
   * Suites whose failure SCREENSHOTS may appear in the report: the same suites
   * whose failure evidence CI publishes (ADR-0003, Stage 4), because they
   * never use test accounts, e-mails, passwords or card data. A directory ends
   * with `/`; anything else is one spec file. Every other attachment (traces,
   * videos, error contexts, account cleanup records, HTTP evidence, console
   * output) is always dropped.
   */
  readonly screenshotSuites: readonly string[];
}

export const SQAF_ALLURE: AllurePolicy = Object.freeze({
  rawResultsDir: 'allure-results',
  safeResultsDir: 'allure-results-safe',
  reportDir: 'allure-report',
  historyFile: 'allure-history/history.jsonl',
  configFile: 'allurerc.mjs',
  statusFile: 'reports/allure-status.json',
  screenshotSuites: Object.freeze([
    'tests/e2e/products/',
    'tests/integration/pages/base-page.spec.ts',
    'tests/integration/pages/cart.spec.ts',
    'tests/integration/pages/products.spec.ts',
    'tests/integration/pages/product-components.spec.ts',
    'tests/integration/fixtures/anti-bot.spec.ts',
    'tests/integration/fixtures/fixtures.spec.ts',
  ]),
});
