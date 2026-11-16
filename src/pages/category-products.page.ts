import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { CartModal } from './components/cart-modal.component';
import { CategorySidebar } from './components/category-sidebar.component';
import { ProductGrid } from './components/product-grid.component';

/**
 * SQAF — Category page (`/category_products/<id>`, Stage 4, TC18). Reached
 * from the category sidebar.
 *
 * SUT DOM (observed 2026-11-16): the product grid with the heading
 * "<Section> - <Category> Products" (shown in upper case by CSS; the text is
 * mixed case) and the category sidebar.
 */
export class CategoryProductsPage extends BasePage {
  protected readonly path = undefined;

  readonly heading: Locator;
  readonly productGrid: ProductGrid;
  readonly categorySidebar: CategorySidebar;
  readonly cartModal: CartModal;

  constructor(page: CategoryProductsPage['page']) {
    super(page);
    this.productGrid = new ProductGrid(page.locator('.features_items'));
    // The prices of the cards are h2 headings too: the title is the one ending in "Products".
    this.heading = this.productGrid.root.getByRole('heading', { name: / - .+ Products$/ });
    this.categorySidebar = new CategorySidebar(page.locator('.left-sidebar'));
    this.cartModal = CartModal.of(page);
  }

  protected async assertReady(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }
}
