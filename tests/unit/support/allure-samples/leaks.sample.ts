import { expect, test } from '@playwright/test';

/**
 * Synthetic samples for the SQAF Allure pipeline (no browser, no SUT). Run
 * only through tests/unit/support/allure-samples.config.ts. They put into the
 * RAW Allure results everything that must never reach the report: an account
 * address with its data id, a generated-looking password, a test card number,
 * typed values in step titles, the `sqaf-test-data` annotation, an account
 * cleanup record, console output, a screenshot of a suite that is not
 * allowlisted and the local repository path.
 *
 * Every value is fictitious and built at runtime (the data id has the real
 * SHAPE: `user-<8 alnum>-<8 hex>-<n>`).
 */
const DATA_ID = ['user', 'zz00zz00', 'abcdef01', '7'].join('-');
const EMAIL = `sqaf.${DATA_ID}@example.com`;
const PASSWORD = ['Sqaf#', 'q'.repeat(16)].join('');
const CARD = ['4111', '1111', '1111', '1111'].join('');
/** 1×1 transparent PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const traceability = {
  annotation: [
    { type: 'sqaf-test-case', description: 'TC1: Register User (https://automationexercise.com/test_cases)' },
    { type: 'sqaf-baseline-pair', description: 'baseline/baseline.spec.ts › TC1 - Register User' },
  ],
};

test('TC1: Register User', { tag: ['@regression', '@account'], ...traceability }, async ({}, testInfo) => {
  testInfo.annotations.push({ type: 'sqaf-test-data', description: `newUserData: ${DATA_ID} (profile default)` });
  await test.step(`Fill "${EMAIL}"`, async () => {
    await test.step(`Type "${PASSWORD}"`, async () => {});
  });
  console.log(`created ${EMAIL} with card ${CARD}`);
  await testInfo.attach('sqaf-account-cleanup', { contentType: 'application/json', body: JSON.stringify({ dataId: DATA_ID }) });
  await testInfo.attach('screenshot', { contentType: 'image/png', body: PNG });
  expect(`${EMAIL} ${PASSWORD} ${CARD} at ${process.cwd()}`, 'account form').toBe('the registered account');
});

for (const term of ['jeans', 'saree']) {
  test(`TC9: Search Product [${term}]`, { tag: ['@regression', '@smoke'] }, async () => {
    await test.step('Search the term', async () => {});
  });
}

test('is flaky: fails on the first attempt only', async ({}, testInfo) => {
  expect(testInfo.retry, 'first attempt').toBe(1);
});
