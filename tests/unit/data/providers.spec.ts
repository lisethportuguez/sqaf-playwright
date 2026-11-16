import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test, type TestInfo } from '@playwright/test';
import { sqafConfig } from '../../../config';
import { caseTitle, createDatasetProvider, DATASETS, testData } from '../../../src/data';
import { DataValidationError } from '../../../src/errors';

/** Stage 3 — data providers over the real datasets and over synthetic files (ADR-0009). */

function datasetRoot(testInfo: TestInfo, files: Record<string, string>): string {
  const root = testInfo.outputPath('test-data');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content, 'utf8');
  }
  return root;
}

function errorOf(run: () => unknown): DataValidationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DataValidationError);
    return error as DataValidationError;
  }
  throw new Error('expected a DataValidationError');
}

test.describe('the versioned datasets', () => {
  test('the dataset root comes from the Configuration layer', () => {
    expect(sqafConfig.testData.rootDir.replaceAll('\\', '/')).toMatch(/\/test-data$/);
  });

  for (const [name, provider] of Object.entries(testData)) {
    test(`${name} (${provider.source}) is valid, non-empty and frozen`, () => {
      const items = provider.all();
      expect(items.length).toBeGreaterThan(0);
      expect(Object.isFrozen(items)).toBe(true);
      for (const item of items) expect(Object.isFrozen(item)).toBe(true);
      expect(provider.description.length).toBeGreaterThan(0);
    });
  }

  test('every catalog entry has a provider', () => {
    expect(Object.keys(testData).sort()).toEqual(Object.keys(DATASETS).sort());
  });

  test('cases are reusable by id and the same object is returned every time', () => {
    const blueTop = testData.products.byId(1);
    expect(blueTop).toEqual({ id: 1, name: 'Blue Top', price: 500, brand: 'Polo', category: 'Women > Tops' });
    expect(testData.products.byId(1)).toBe(blueTop);
    expect(testData.paymentCards.byId('test-visa').cardNumber).toBe('4111111111111111');
  });

  test('where() filters, and refuses an empty selection', () => {
    expect(testData.products.where((p) => p.price < 600, 'price < 600').map((p) => p.id)).toEqual([1, 2]);
    expect(errorOf(() => testData.products.where(() => false, 'nothing')).issues).toEqual(['no case matches "nothing"']);
  });

  test('an unknown id lists the known ones', () => {
    expect(errorOf(() => testData.accountProfiles.byId('missing')).issues[0]).toBe(
      'unknown case id "missing". Known ids: default, united-states-minimal',
    );
  });

  test('caseTitle gives unique, readable data-driven titles', () => {
    const titles = testData.invalidCredentials.all().map((c) => caseTitle('rejects invalid login', c));
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles[0]).toBe('rejects invalid login [unregistered-email]');
  });
});

test.describe('structural errors raise DataValidationError (synthetic files)', () => {
  const definition = DATASETS.products;
  const valid = { id: 1, name: 'A', price: 1, brand: 'B', category: 'Men > Jeans' };

  test('missing file', ({}, testInfo) => {
    const provider = createDatasetProvider(definition, datasetRoot(testInfo, {}));
    const error = errorOf(() => provider.all());
    expect(error.source).toBe('products/catalog.json');
    expect(error.issues[0]).toMatch(/^file not found or unreadable \(ENOENT\)$/);
  });

  test('invalid JSON', ({}, testInfo) => {
    const provider = createDatasetProvider(definition, datasetRoot(testInfo, { 'products/catalog.json': '{ "items": [' }));
    expect(errorOf(() => provider.all()).issues[0]).toMatch(/^invalid JSON: /);
  });

  test('wrong envelope, wrong item fields and duplicated ids, all reported at once', ({}, testInfo) => {
    const content = JSON.stringify({
      description: 'd',
      extra: true,
      items: [valid, { ...valid, price: '500' }, valid],
    });
    const provider = createDatasetProvider(definition, datasetRoot(testInfo, { 'products/catalog.json': content }));
    expect(errorOf(() => provider.all()).issues).toEqual([
      '$.extra: unknown field',
      '$.items[1].price: expected an integer >= 0, received a string',
      '$.items[1].id: duplicated value "1" (first at [0])',
      '$.items[2].id: duplicated value "1" (first at [0])',
    ]);
  });

  test('empty dataset (a data-driven loop would generate no test)', ({}, testInfo) => {
    const content = JSON.stringify({ description: 'd', items: [] });
    const provider = createDatasetProvider(definition, datasetRoot(testInfo, { 'products/catalog.json': content }));
    expect(errorOf(() => provider.all()).issues).toEqual(['$.items: expected at least 1 item(s), received 0']);
  });

  test('a file is read lazily and once', ({}, testInfo) => {
    const root = datasetRoot(testInfo, { 'products/catalog.json': JSON.stringify({ description: 'd', items: [valid] }) });
    const provider = createDatasetProvider(definition, root);
    const first = provider.all();
    writeFileSync(join(root, 'products/catalog.json'), 'broken', 'utf8');
    expect(provider.all()).toBe(first);
  });
});
