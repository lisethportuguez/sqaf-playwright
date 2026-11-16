import { expect } from '@playwright/test';
import { BasePage } from './base.page';
import { CartModal } from './components/cart-modal.component';
import { CategorySidebar } from './components/category-sidebar.component';
import { ProductGrid } from './components/product-grid.component';

/**
 * SQAF — Home page (`/`). Ready when the document title is the SUT's home title.
 *
 * Since Stage 4 it exposes the product grid ("Features Items", the same
 * cards as the products page), its "Add to cart" modal and the category
 * sidebar (TC13, TC17, TC18).
 */
export class HomePage extends BasePage {
  protected readonly path = '/';

  readonly productGrid: ProductGrid;
  readonly cartModal: CartModal;
  readonly categorySidebar: CategorySidebar;

  constructor(page: HomePage['page']) {
    super(page);
    this.productGrid = new ProductGrid(page.locator('.features_items'));
    this.cartModal = CartModal.of(page);
    this.categorySidebar = new CategorySidebar(page.locator('.left-sidebar'));
  }

  protected async assertReady(): Promise<void> {
    await expect(this.page).toHaveTitle('Automation Exercise');
  }
}
