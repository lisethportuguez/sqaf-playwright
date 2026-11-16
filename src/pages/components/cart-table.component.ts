import type { Locator } from '@playwright/test';

/** Locators of one product row of a cart table. */
export interface CartItem {
  readonly row: Locator;
  readonly name: Locator;
  readonly price: Locator;
  readonly quantity: Locator;
  readonly total: Locator;
  /** Stage 4 (TC17): the "X" of the row, an icon-only `<a>` without href (no role or name, hence CSS). Only the cart page has it. */
  readonly removeButton: Locator;
}

/**
 * SQAF — Product rows of a cart table (Stage 4, ADR-0010). Shared by the cart
 * page and the "Review Your Order" table of the checkout page, which render
 * the same row markup.
 *
 * SUT DOM (observed 2026-11-16): each product row has `.cart_description`
 * (name link), `.cart_price`, `.cart_quantity` and `.cart_total` cells. The
 * cells have no roles beyond the generic ones, hence CSS (ADR-0007).
 */
export class CartTable {
  /** @param rows the product rows only (a total row, if any, is excluded by the caller). */
  constructor(readonly rows: Locator) {}

  /** Row at a zero-based position. */
  itemAt(position: number): CartItem {
    return this.item(this.rows.nth(position));
  }

  /** Row whose product name is exactly `name`. */
  itemNamed(name: string): CartItem {
    return this.item(
      this.rows.filter({
        has: this.rows.page().locator('.cart_description').getByRole('link', { name, exact: true }),
      }),
    );
  }

  private item(row: Locator): CartItem {
    return {
      row,
      name: row.locator('.cart_description').getByRole('link'),
      price: row.locator('.cart_price'),
      quantity: row.locator('.cart_quantity'),
      total: row.locator('.cart_total'),
      removeButton: row.locator('.cart_quantity_delete'),
    };
  }
}
