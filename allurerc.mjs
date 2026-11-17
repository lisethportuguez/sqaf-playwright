/**
 * SQAF — Allure Report 3 configuration (Stage 6, Phase 2). See ADR-0011.
 *
 * Used ONLY through the SQAF pipeline (src/reporting/allure-reporter.ts),
 * which generates the report from the sanitized and scanned results
 * (`allure-results-safe/`), never from the raw ones.
 *
 * Plain object (no import of `allure`), so the unit tests can read it.
 * tests/unit/reporting/allure-config.spec.ts checks it against the SQAF
 * failure taxonomy (src/errors/classifications.ts).
 */
const CLASSIFICATION = 'sqaf.classification';

/** One Allure category per SQAF category; failures are grouped by the exact classification. */
const sqafCategory = (name, pattern) => ({
  name,
  matchers: { labels: { [CLASSIFICATION]: pattern } },
  groupBy: [{ label: CLASSIFICATION }],
});

export default {
  name: 'SQAF — Test report',
  output: 'allure-report',
  historyPath: process.env.SQAF_ALLURE_HISTORY_FILE ?? './allure-history/history.jsonl',
  // One entry per complete run: the SQAF pipeline sets 0 for a run of the integration tests only (ADR-0011 D11).
  appendHistory: process.env.SQAF_ALLURE_APPEND_HISTORY !== '0',
  categories: {
    rules: [
      sqafCategory('Infrastructure (SUT, network, anti-bot)', /^infrastructure\//),
      sqafCategory('Test data', /^test-data\//),
      sqafCategory('API (test data provisioning)', /^api\//),
      sqafCategory('Automation (locators, timeouts)', /^automation\//),
      sqafCategory('Product behaviour (assertions)', /^assertion\//),
      sqafCategory('Unclassified', /^(unclassified|not classified)$/),
    ],
  },
  plugins: {
    awesome: {
      options: {
        reportName: 'SQAF — Test report',
        singleFile: true,
        reportLanguage: 'en',
        groupBy: ['parentSuite', 'suite', 'subSuite'],
      },
    },
    dashboard: {
      options: {
        reportName: 'SQAF — Trends',
        singleFile: true,
      },
    },
  },
};
