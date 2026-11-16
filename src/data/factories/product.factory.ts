import { DataValidationError } from '../../errors/data-validation-error';
import { formatPrice } from '../../utils/price';
import type { CartLine, Product } from '../types';

/**
 * SQAF — Product factory (Stage 3). See ADR-0009.
 *
 * Products themselves are static catalog data (`products/catalog.json`); this
 * factory derives the EXPECTED values a cart must show, so scenarios never
 * hard-code totals.
 */

const SOURCE = 'factory:product';

export function cartLine(product: Product, quantity = 1): CartLine {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new DataValidationError({ source: SOURCE, issues: [`$.quantity: expected an integer >= 1, received ${quantity}`] });
  }
  return Object.freeze({ product, quantity, total: product.price * quantity });
}

export function cartTotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.total, 0);
}

/** Texts the SUT prints for a cart line (`Rs. 500`, `1`, `Rs. 500`). */
export function cartLineTexts(line: CartLine): { readonly price: string; readonly quantity: string; readonly total: string } {
  return Object.freeze({
    price: formatPrice(line.product.price),
    quantity: String(line.quantity),
    total: formatPrice(line.total),
  });
}
