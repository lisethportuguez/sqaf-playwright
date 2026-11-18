import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import { SQAF_ALLURE } from '../../../config';
import {
  CLASSIFICATION_LABEL,
  groupingOf,
  NOT_CLASSIFIED,
  prepareAllureResults,
  projectPrefix,
  REDACTED_DATA_ID,
  REDACTED_HOST,
  sanitizeText,
  screenshotAllowed,
  type AllureResult,
  type SanitizeContext,
} from '../../../src/reporting/allure/prepare-results';

/**
 * Stage 6, Phase 2 (ADR-0011) — preparation of the Allure results: the ONLY
 * input of the report. Synthetic raw results written by hand (the shape of
 * allure-playwright 3.14.0, checked end to end in allure-reporter.spec.ts).
 * Every value is fictitious and built at runtime.
 */
const DATA_ID = ['user', 'zz00zz00', 'abcdef01', '5'].join('-');
const EMAIL = `sqaf.${DATA_ID}@example.com`;
const PASSWORD = ['Sqaf#', 'r'.repeat(16)].join('');
const CARD = ['4111', '1111', '1111', '1111'].join('');
const HOST = 'sqaf-build-host';
const ROOT = String.raw`C:\Work\Someone\sqaf`;
const CONTEXT: SanitizeContext = { rootDir: ROOT, homeDir: String.raw`C:\Users\someone`, host: HOST };

test.describe('sanitizeText', () => {
  test('removes e-mails, passwords, cards, data ids, typed values, paths and the host name', () => {
    const raw = [
      `Fill "${EMAIL}"`,
      `- fill("${PASSWORD}")`,
      `password=${PASSWORD}&card=${CARD}`,
      `{"password": "secret-value"}`,
      `newUserData: ${DATA_ID} (profile default)`,
      `the run token ${DATA_ID.slice('user-'.length)}`,
      String.raw`at ${ROOT}\tests\e2e\products\tc09.spec.ts:13:3`,
      String.raw`at C:\Users\someone\AppData\x.js`,
      String.raw`at D:\Users\another\x.js`,
      '/home/runner/work/sqaf/sqaf/tests/e2e/x.spec.ts',
      `host ${HOST.toUpperCase()}`,
    ].join('\n');
    const out = sanitizeText(raw, CONTEXT);
    for (const secret of [EMAIL, PASSWORD, CARD, DATA_ID, DATA_ID.slice(5), 'secret-value', 'someone', 'another', 'runner', HOST, HOST.toUpperCase()]) {
      expect(out, secret).not.toContain(secret);
    }
    expect(out).toContain('Fill "[REDACTED]"');
    expect(out).toContain(REDACTED_DATA_ID);
    expect(out).toContain(String.raw`<root>\tests\e2e\products\tc09.spec.ts:13:3`);
    expect(out).toContain('/home/[user]/work');
    expect(out).toContain(REDACTED_HOST);
  });

  test('keeps ordinary report text intact', () => {
    const text = 'TC9: Search Product [jeans] › Search the term: "Searched Products" is visible (1794891292308 ms)';
    expect(sanitizeText(text, CONTEXT)).toBe(text);
  });
});

test.describe('grouping and attachment allowlist', () => {
  test('suite → module → scenario', () => {
    expect(groupingOf('tests/e2e/products/tc09-search-product.spec.ts', 'TC9: Search Product [jeans]', 'chromium')).toEqual({
      parentSuite: 'E2E (chromium)',
      suite: 'Products',
      subSuite: 'TC9: Search Product',
    });
    expect(groupingOf('tests/e2e/authentication/tc01-register-user.spec.ts', 'TC1: Register User', 'chromium').suite).toBe('Authentication');
    expect(groupingOf('tests/e2e/checkout/tc14-x.spec.ts', 'TC14: Place Order', 'chromium').suite).toBe('Checkout');
    expect(groupingOf('tests/integration/pages/cart.spec.ts', 'removes a line', 'integration')).toEqual({
      parentSuite: 'Integration',
      suite: 'Pages',
      subSuite: 'cart',
    });
  });

  test('screenshots only of the allowlisted suites', () => {
    expect(screenshotAllowed('tests/e2e/products/tc09-search-product.spec.ts')).toBe(true);
    expect(screenshotAllowed('tests/integration/pages/cart.spec.ts')).toBe(true);
    for (const file of [
      'tests/e2e/authentication/tc01-register-user.spec.ts',
      'tests/e2e/checkout/tc14-place-order-register-while-checkout.spec.ts',
      'tests/integration/pages/auth.spec.ts',
      'tests/integration/pages/checkout-components.spec.ts',
      'tests/integration/data/account-api.spec.ts',
      'tests/integration/pages/cart.spec.ts.bak',
      'baseline/baseline.spec.ts',
    ]) {
      expect(screenshotAllowed(file), file).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic raw results
// ---------------------------------------------------------------------------

const att = (name: string, source: string, type: string) => ({ name, source, type });

function rawResult(overrides: Partial<AllureResult> & { uuid: string; fullName: string; name: string }): AllureResult {
  return {
    historyId: `h-${overrides.name}`,
    testCaseId: `c-${overrides.name}`,
    status: 'passed',
    stage: 'finished',
    start: 1_000,
    stop: 2_000,
    statusDetails: {},
    steps: [],
    attachments: [],
    parameters: [{ name: 'Project', value: 'chromium' }],
    labels: [
      { name: 'language', value: 'javascript' },
      { name: 'framework', value: 'playwright' },
      { name: 'host', value: HOST },
      { name: 'thread', value: 'pid-1-worker-0' },
      { name: 'titlePath', value: String.raw` > chromium > tests\e2e\x.spec.ts` },
      { name: 'package', value: 'sqaf-playwright.products.x' },
      { name: 'suite', value: String.raw`tests\e2e\products\x.spec.ts` },
      { name: 'unknown-label', value: EMAIL },
      { name: 'tag', value: 'regression' },
    ],
    links: [],
    ...overrides,
  };
}

interface Fixture {
  readonly rawDir: string;
  readonly safeDir: string;
  readonly classificationFile: string;
}

function writeRaw(testInfo: TestInfo, results: readonly AllureResult[], files: Record<string, string | Buffer> = {}, classification?: object): Fixture {
  const rawDir = testInfo.outputPath('allure-results');
  const safeDir = testInfo.outputPath('allure-results-safe');
  mkdirSync(rawDir, { recursive: true });
  for (const result of results) writeFileSync(join(rawDir, `${result.uuid}-result.json`), JSON.stringify(result));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(rawDir, name), body);
  const classificationFile = testInfo.outputPath('failure-classification.json');
  if (classification) writeFileSync(classificationFile, JSON.stringify(classification));
  return { rawDir, safeDir, classificationFile };
}

function readSafe(safeDir: string): AllureResult[] {
  return readdirSync(safeDir)
    .filter((file) => file.endsWith('-result.json'))
    .map((file) => JSON.parse(readFileSync(join(safeDir, file), 'utf8')) as AllureResult);
}

const label = (result: AllureResult, name: string): string[] => (result.labels ?? []).filter((l) => l.name === name).map((l) => l.value);

test('sanitizes every text field and rebuilds the labels', ({}, testInfo) => {
  const f = writeRaw(testInfo, [
    rawResult({
      uuid: 'u1',
      fullName: 'tests/e2e/authentication/tc01-register-user.spec.ts › TC1: Register User',
      name: 'TC1: Register User',
      status: 'failed',
      description: `account ${EMAIL}`,
      statusDetails: { message: `Received: "${EMAIL} ${PASSWORD} ${CARD}"`, trace: String.raw`at ${ROOT}\tests\e2e\x.ts` },
      steps: [
        { name: 'sqaf-test-case: TC1: Register User (https://automationexercise.com/test_cases)', status: 'passed', steps: [] },
        { name: 'sqaf-baseline-pair: baseline/baseline.spec.ts › TC1 - Register User', status: 'passed', steps: [] },
        { name: `sqaf-test-data: newUserData: ${DATA_ID} (profile default)`, status: 'passed', steps: [] },
        { name: `other-annotation: ${EMAIL}`, status: 'passed', steps: [] },
        {
          name: 'Register through the UI',
          status: 'failed',
          start: 1_100,
          stop: 1_900,
          statusDetails: { message: `- fill("${PASSWORD}")` },
          parameters: [{ name: 'email', value: EMAIL }],
          steps: [{ name: `Fill "${EMAIL}"`, status: 'failed', start: 1_200, stop: 1_300, steps: [] }],
        },
      ],
      links: [{ name: 'evil', url: `javascript:alert("${EMAIL}")` }],
    }),
  ], {}, { failures: [] });

  const outcome = prepareAllureResults({ ...f, context: CONTEXT, host: HOST });
  expect(outcome).toMatchObject({ results: 1, written: true, leaks: [] });
  const [result] = readSafe(f.safeDir);
  const text = JSON.stringify(result);
  for (const secret of [EMAIL, PASSWORD, CARD, DATA_ID, 'Someone', HOST, 'sqaf-test-data', 'other-annotation', 'javascript:']) {
    expect(text, secret).not.toContain(secret);
  }
  expect(result!.steps!.map((s) => s.name)).toEqual(['Register through the UI']);
  expect(result!.steps![0]!.steps!.map((s) => s.name)).toEqual(['Fill "[REDACTED]"']);
  expect(result!.links).toEqual([{ name: 'Official TC1', url: 'https://automationexercise.com/test_cases', type: 'tms' }]);
  expect(label(result!, 'baselinePair')).toEqual(['baseline/baseline.spec.ts › TC1 - Register User']);
  expect(result!.labels!.map((l) => l.name).sort()).toEqual(
    ['baselinePair', 'feature', 'framework', 'language', 'parentSuite', CLASSIFICATION_LABEL, 'story', 'subSuite', 'suite', 'tag'].sort(),
  );
  expect([label(result!, 'parentSuite'), label(result!, 'suite'), label(result!, 'subSuite')]).toEqual([['E2E (chromium)'], ['Authentication'], ['TC1: Register User']]);
  expect(result!.titlePath).toEqual(['E2E (chromium)', 'Authentication', 'TC1: Register User']);
  expect(readFileSync(join(f.safeDir, 'environment.properties'), 'utf8')).toContain('Projects=chromium');
});

test('keeps only failure screenshots of allowlisted suites; every other attachment and raw file is dropped', ({}, testInfo) => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const f = writeRaw(
    testInfo,
    [
      rawResult({
        uuid: 'p1',
        fullName: 'tests/e2e/products/tc12-add-products-in-cart.spec.ts › TC12: Add Products in Cart',
        name: 'TC12: Add Products in Cart',
        status: 'failed',
        attachments: [att('screenshot', 'shot-p.png', 'image/png'), att('trace', 'trace-p.zip', 'application/zip'), att('video', 'video-p.webm', 'video/webm')],
        steps: [
          { name: 'error-context', status: 'passed', start: 1, stop: 2, attachments: [att('error-context', 'ctx-p.md', 'text/markdown')], steps: [] },
          { name: 'stdout', status: 'passed', start: 1, stop: 2, attachments: [att('stdout', 'out-p.txt', 'text/plain')], steps: [] },
        ],
      }),
      rawResult({
        uuid: 'a1',
        fullName: 'tests/e2e/authentication/tc02-login-user-correct.spec.ts › TC2: Login User with correct email and password',
        name: 'TC2: Login User with correct email and password',
        status: 'failed',
        attachments: [att('screenshot', 'shot-a.png', 'image/png'), att('sqaf-account-cleanup', 'cleanup-a.json', 'application/json')],
      }),
      rawResult({
        uuid: 'p2',
        fullName: 'tests/e2e/products/tc08-verify-all-products-and-detail.spec.ts › TC8: Verify All Products and product detail page',
        name: 'TC8: Verify All Products and product detail page',
        status: 'failed',
        attachments: [att('screenshot', '../escape.png', 'image/png'), att('screenshot', 'missing.png', 'image/png'), att('sqaf-http-evidence', 'http-p.json', 'application/json')],
      }),
    ],
    {
      'shot-p.png': png,
      'shot-a.png': png,
      'trace-p.zip': 'PK',
      'video-p.webm': 'x',
      'ctx-p.md': `- textbox "Email": ${EMAIL}`,
      'out-p.txt': EMAIL,
      'cleanup-a.json': JSON.stringify({ dataId: DATA_ID }),
      'http-p.json': '{}',
      'c1-container.json': JSON.stringify({ befores: [{ name: `Fill "${EMAIL}"` }] }),
      'categories.json': '[]',
      'executor.json': '{}',
    },
  );

  const outcome = prepareAllureResults({ ...f, context: CONTEXT, host: HOST });
  expect(outcome).toMatchObject({ results: 3, attachmentsKept: 1, attachmentsDropped: 9, written: true });
  const prefix = projectPrefix('chromium');
  expect(readdirSync(f.safeDir).sort()).toEqual(
    ['environment.properties', `${prefix}a1-result.json`, `${prefix}p1-result.json`, `${prefix}p2-result.json`, `${prefix}shot-p.png`].sort(),
  );
  const byUuid = Object.fromEntries(readSafe(f.safeDir).map((r) => [r.uuid, r]));
  expect(byUuid['p1']!.attachments).toEqual([{ name: 'screenshot', source: `${prefix}shot-p.png`, type: 'image/png' }]);
  expect(byUuid['p1']!.steps).toEqual([]); // wrappers of dropped attachments are dropped too
  expect(byUuid['a1']!.attachments).toEqual([]);
  expect(byUuid['p2']!.attachments).toEqual([]);
});

test('reads the SQAF classification of each failed attempt without recomputing or modifying it', ({}, testInfo) => {
  const file = 'tests/e2e/products/tc09-search-product.spec.ts';
  const attempt = (uuid: string, name: string, status: string, start: number) =>
    rawResult({ uuid, fullName: `${file} › ${name}`, name, status, start, stop: start + 10 });
  const classification = {
    schemaVersion: 2,
    failures: [
      { test: 'products/tc09-search-product.spec.ts › TC9: Search Product [jeans]', project: 'chromium', file, line: 13, retry: 0, classification: 'infrastructure/anti-bot-challenge' },
      { test: 'products/tc09-search-product.spec.ts › TC9: Search Product [jeans]', project: 'chromium', file, line: 13, retry: 1, classification: 'assertion/mismatch' },
      { test: 'products/tc09-search-product.spec.ts › TC9: Search Product [saree]', project: 'firefox', file, line: 13, retry: 0, classification: 'infrastructure/network' },
    ],
  };
  const f = writeRaw(
    testInfo,
    [
      attempt('j1', 'TC9: Search Product [jeans]', 'broken', 5_000), // retry 1 (later start)
      attempt('j0', 'TC9: Search Product [jeans]', 'failed', 1_000), // retry 0
      attempt('j2', 'TC9: Search Product [jeans]', 'passed', 9_000), // retry 2: passed, never classified
      attempt('s0', 'TC9: Search Product [saree]', 'failed', 1_000), // only a firefox entry exists
    ],
    {},
    classification,
  );
  const before = createHash('sha256').update(readFileSync(f.classificationFile)).digest('hex');

  const outcome = prepareAllureResults({ ...f, context: CONTEXT, host: HOST });
  expect(outcome.classified).toBe(3);
  const byUuid = Object.fromEntries(readSafe(f.safeDir).map((r) => [r.uuid, r]));
  expect(label(byUuid['j0']!, CLASSIFICATION_LABEL)).toEqual(['infrastructure/anti-bot-challenge']);
  expect(label(byUuid['j1']!, CLASSIFICATION_LABEL)).toEqual(['assertion/mismatch']);
  expect(label(byUuid['j2']!, CLASSIFICATION_LABEL)).toEqual([]);
  expect(label(byUuid['s0']!, CLASSIFICATION_LABEL)).toEqual([NOT_CLASSIFIED]);
  expect(byUuid['j0']!.parameters).toContainEqual({ name: 'Case', value: 'jeans' });
  expect(label(byUuid['j0']!, 'subSuite')).toEqual(['TC9: Search Product']);
  expect(createHash('sha256').update(readFileSync(f.classificationFile)).digest('hex')).toBe(before);
});

test('fail-closed: if the prepared output is unsafe nothing is written and the safe directory is untouched', ({}, testInfo) => {
  const f = writeRaw(testInfo, [
    rawResult({ uuid: 'u1', fullName: 'tests/e2e/products/x.spec.ts › TC8: x', name: `TC8: ${EMAIL}`, status: 'failed', statusDetails: { message: PASSWORD } }),
  ]);
  mkdirSync(f.safeDir, { recursive: true });
  writeFileSync(join(f.safeDir, `${projectPrefix('chromium')}previous-result.json`), '{"name":"previous run"}');

  const outcome = prepareAllureResults({ ...f, context: CONTEXT, host: HOST, sanitize: (text) => text }); // sanitizer disabled
  expect(outcome.written).toBe(false);
  expect(outcome.leaks.map((l) => l.detector)).toEqual(expect.arrayContaining(['email', 'generated-password', 'data-id']));
  expect(readdirSync(f.safeDir)).toEqual([`${projectPrefix('chromium')}previous-result.json`]);
  expect(existsSync(`${f.safeDir}.staging`)).toBe(false);
});

test('a new run of a project replaces only that project’s prepared results', ({}, testInfo) => {
  const f = writeRaw(testInfo, [rawResult({ uuid: 'new', fullName: 'tests/e2e/products/x.spec.ts › TC8: x', name: 'TC8: x' })]);
  mkdirSync(f.safeDir, { recursive: true });
  writeFileSync(join(f.safeDir, `${projectPrefix('chromium')}old-result.json`), '{}');
  writeFileSync(join(f.safeDir, `${projectPrefix('integration')}kept-result.json`), '{}');

  prepareAllureResults({ ...f, context: CONTEXT, host: HOST });
  expect(readdirSync(f.safeDir).sort()).toEqual(
    ['environment.properties', `${projectPrefix('chromium')}new-result.json`, `${projectPrefix('integration')}kept-result.json`].sort(),
  );
});

test('the screenshot allowlist is the policy of the Configuration layer', () => {
  expect(SQAF_ALLURE.screenshotSuites).toContain('tests/e2e/products/');
  expect(Object.isFrozen(SQAF_ALLURE.screenshotSuites)).toBe(true);
});
