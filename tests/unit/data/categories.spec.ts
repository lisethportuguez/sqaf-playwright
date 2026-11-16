import { expect, test } from '@playwright/test';
import { DataValidationError } from '../../../src/errors';
import { DATASETS, testData, validate, type CategorySection, type ProductCategory } from '../../../src/data';
import { productCategorySchema } from '../../../src/data/validation/schemas';
import type { SidebarSection } from '../../../src/pages';

/** Stage 4 (E4.2, TC18) — dataset products/categories.json: schema, provider and consistency. */

const VALID: ProductCategory = {
  id: 'women-dress',
  description: 'Women > Dress',
  section: 'Women',
  name: 'Dress',
  categoryId: 1,
  heading: 'Women - Dress Products',
  expectedProducts: ['Sleeveless Dress'],
};

function issuesOf(value: unknown): readonly string[] {
  try {
    validate(productCategorySchema, value, 'test');
  } catch (error) {
    if (error instanceof DataValidationError) return error.issues;
    throw error;
  }
  return [];
}

test.describe('schema', () => {
  test('accepts a valid category', () => {
    expect(issuesOf(VALID)).toEqual([]);
  });

  test('rejects an unknown section, a malformed heading, a bad id and an empty product list', () => {
    expect(issuesOf({ ...VALID, section: 'Babies' })).toHaveLength(1);
    expect(issuesOf({ ...VALID, heading: 'WOMEN - DRESS PRODUCTS' })).toHaveLength(1);
    expect(issuesOf({ ...VALID, heading: 'Dress Products' })).toHaveLength(1);
    expect(issuesOf({ ...VALID, categoryId: 0 })).toHaveLength(1);
    expect(issuesOf({ ...VALID, id: 'Women Dress' })).toHaveLength(1);
    expect(issuesOf({ ...VALID, expectedProducts: [] })).toHaveLength(1);
    expect(issuesOf({ ...VALID, extra: true })).toHaveLength(1);
  });
});

test.describe('provider', () => {
  const categories = testData.productCategories.all();

  test('is registered in the dataset catalog and loads frozen cases', () => {
    expect(DATASETS.productCategories.file).toBe('products/categories.json');
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(Object.isFrozen(categories)).toBe(true);
    for (const category of categories) expect(Object.isFrozen(category)).toBe(true);
  });

  test('the TC18 cases exist', () => {
    expect(testData.productCategories.byId('women-dress')).toMatchObject({ section: 'Women', name: 'Dress', categoryId: 1 });
    expect(testData.productCategories.byId('men-tshirts')).toMatchObject({ section: 'Men', name: 'Tshirts', categoryId: 3 });
  });

  test('every heading is "<section> - <name> Products"; ids and products are unique', () => {
    for (const category of categories) {
      expect(category.heading).toBe(`${category.section} - ${category.name} Products`);
      expect(new Set(category.expectedProducts).size, category.id).toBe(category.expectedProducts.length);
    }
    expect(new Set(categories.map((c) => c.categoryId)).size).toBe(categories.length);
  });

  test('is consistent with the catalog and the search terms', () => {
    // Each catalog product appears in the category it declares, when that category is in the dataset.
    for (const product of testData.products.all()) {
      const category = categories.find((c) => `${c.section} > ${c.name}` === product.category);
      if (category) expect(category.expectedProducts, product.name).toContain(product.name);
    }
    expect(testData.productCategories.byId('men-jeans').expectedProducts).toEqual(
      testData.productSearches.byId('jeans').expectedProducts,
    );
  });
});

test('the data section type and the Page Object section type are the same set', () => {
  // Compile-time checks (ADR-0009 D4): both directions must be assignable.
  const fromData: SidebarSection = 'Kids' as CategorySection;
  const fromPages: CategorySection = 'Men' as SidebarSection;
  expect([fromData, fromPages]).toEqual(['Kids', 'Men']);
});
