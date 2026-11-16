import { expect, scenario, test, testData, type ProductCategory } from '@sqaf/fixtures';

/**
 * TC18 — View Category Products (official test case). No account.
 *
 * Follows the official flow: a Women category from the home page sidebar,
 * then a Men category from the sidebar of the category page. The expected
 * heading, URL and exact products come from products/categories.json.
 */
const tc = scenario('TC18');
const women = testData.productCategories.byId('women-dress');
const men = testData.productCategories.byId('men-tshirts');

test(tc.title, tc.details, async ({ homePage, categoryProductsPage }) => {
  const expectCategoryPage = async (category: ProductCategory): Promise<void> => {
    await categoryProductsPage.waitUntilReady();
    await expect(categoryProductsPage.page).toHaveURL(new RegExp(`/category_products/${category.categoryId}$`));
    await expect(categoryProductsPage.heading).toHaveText(category.heading);
    await expect(categoryProductsPage.productGrid.cards).toHaveCount(category.expectedProducts.length);
    for (const name of category.expectedProducts) {
      await expect(categoryProductsPage.productGrid.productNamed(name).name).toHaveText(name);
    }
  };

  await test.step('Open the home page: the categories are visible on the left sidebar', async () => {
    await homePage.open();
    await expect(homePage.categorySidebar.heading).toBeVisible();
    for (const section of ['Women', 'Men', 'Kids'] as const) {
      await expect(homePage.categorySidebar.sectionToggle(section)).toBeVisible();
    }
  });

  await test.step(`Open ${women.section} > ${women.name}: its category page and products are shown`, async () => {
    await homePage.categorySidebar.openCategory(women.section, women.name);
    await expectCategoryPage(women);
  });

  await test.step(`Open ${men.section} > ${men.name} from the sidebar: its category page and products are shown`, async () => {
    await categoryProductsPage.categorySidebar.openCategory(men.section, men.name);
    await expectCategoryPage(men);
  });
});
