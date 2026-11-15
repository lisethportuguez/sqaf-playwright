import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SQAF — Product detail page (`/product_details/<id>`).
 *
 * The path depends on the product, so it is opened with `openProduct(id)`
 * or reached from a ProductCard. SUT DOM (observed 2026-11-15):
 * `.product-information` with the name in an `h2`, "Category: ..." in a `p`,
 * the price "Rs. N" in a `span`, and "Availability:", "Condition:" and
 * "Brand:" as `<b>` labels inside `p` elements.
 */
export class ProductDetailsPage extends BasePage {
  protected readonly path = undefined;

  readonly information: Locator;
  readonly productName: Locator;
  readonly category: Locator;
  readonly price: Locator;
  readonly availability: Locator;
  readonly condition: Locator;
  readonly brand: Locator;

  constructor(page: ProductDetailsPage['page']) {
    super(page);
    this.information = page.locator('.product-information');
    this.productName = this.information.getByRole('heading', { level: 2 });
    this.category = this.information.getByText(/^Category:/);
    this.price = this.information.getByText(/^Rs\. \d+$/);
    this.availability = this.information.locator('p').filter({ hasText: 'Availability:' });
    this.condition = this.information.locator('p').filter({ hasText: 'Condition:' });
    this.brand = this.information.locator('p').filter({ hasText: 'Brand:' });
  }

  async openProduct(productId: number): Promise<void> {
    await this.navigateTo(`/product_details/${productId}`);
  }

  protected async assertReady(): Promise<void> {
    await expect(this.information).toBeVisible();
  }
}
