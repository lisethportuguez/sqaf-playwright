import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { CartModal } from './components/cart-modal.component';
import { ProductCard } from './components/product-card.component';

/**
 * SQAF — "All Products" page (`/products`), including search results
 * (`/products?search=...`, heading "Searched Products").
 *
 * SUT DOM (observed 2026-11-15): grid `.features_items` of
 * `.product-image-wrapper` cards (no roles or data-qa, hence CSS); search
 * input with placeholder "Search Product"; `#submit_search` is an icon-only
 * button with no accessible name or data-qa, hence its id. The button is
 * bound by jQuery: `waitUntilReady()` (load event) runs before any search.
 */
export class ProductsPage extends BasePage {
  protected readonly path = '/products';

  readonly allProductsHeading: Locator;
  readonly searchedProductsHeading: Locator;
  readonly productCards: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly cartModal: CartModal;

  constructor(page: ProductsPage['page']) {
    super(page);
    this.allProductsHeading = page.getByRole('heading', { name: 'All Products', exact: true });
    this.searchedProductsHeading = page.getByRole('heading', { name: 'Searched Products', exact: true });
    this.productCards = page.locator('.features_items .product-image-wrapper');
    this.searchInput = page.getByPlaceholder('Search Product', { exact: true });
    this.searchButton = page.locator('#submit_search');
    this.cartModal = new CartModal(page.locator('#cartModal'));
  }

  /** Card at a zero-based position of the current grid. */
  productAt(position: number): ProductCard {
    return new ProductCard(this.productCards.nth(position));
  }

  /** Card whose visible product name is exactly `name`. */
  productNamed(name: string): ProductCard {
    return new ProductCard(
      this.productCards.filter({ has: this.page.locator('.productinfo').getByText(name, { exact: true }) }),
    );
  }

  /** Searches and waits for the results page (the SUT reloads `/products?search=`). */
  async search(term: string): Promise<void> {
    await this.searchInput.fill(term);
    await this.searchButton.click();
    await this.page.waitForURL((url) => url.pathname === '/products' && url.searchParams.get('search') === term);
    await this.waitUntilReady();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.allProductsHeading.or(this.searchedProductsHeading)).toBeVisible();
  }
}
