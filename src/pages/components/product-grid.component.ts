import type { Locator } from '@playwright/test';
import { ProductCard } from './product-card.component';

/**
 * SQAF — Product grid (Stage 4, ADR-0010). Shared by the home page, the "All
 * Products" page and the category pages, which render the same grid.
 *
 * SUT DOM (observed 2026-11-16): `.features_items` holds one
 * `.product-image-wrapper` card per product (no roles or data-qa, hence CSS,
 * ADR-0007). The home page also has a "recommended items" carousel with the
 * same cards OUTSIDE `.features_items`: scoping to the grid keeps them apart.
 */
export class ProductGrid {
  readonly cards: Locator;

  constructor(readonly root: Locator) {
    this.cards = root.locator('.product-image-wrapper');
  }

  productAt(position: number): ProductCard {
    return new ProductCard(this.cards.nth(position));
  }

  productNamed(name: string): ProductCard {
    return new ProductCard(
      this.cards.filter({ has: this.root.page().locator('.productinfo').getByText(name, { exact: true }) }),
    );
  }
}
