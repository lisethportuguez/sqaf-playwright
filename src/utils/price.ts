/**
 * SQAF — Price utilities (Stage 5). Pure functions.
 *
 * Automation Exercise prints prices as `Rs. 500` (integer rupees, optional
 * thousands separators). Utilities never import the Error Handling layer, so
 * an unreadable price raises a plain RangeError; callers in higher layers add
 * the context.
 */

export const CURRENCY_PREFIX = 'Rs.';

const PRICE = /^(?:Rs\.?\s*)?(\d{1,3}(?:,\d{3})+|\d+)$/i;

/** `'Rs. 500'` → 500, `'Rs.1,500'` → 1500, `'500'` → 500. */
export function parsePrice(text: string): number {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  const match = PRICE.exec(trimmed);
  if (!match) throw new RangeError(`Not a price: "${text}". Expected the format "Rs. 500".`);
  return Number(match[1]!.replaceAll(',', ''));
}

/** 500 → `'Rs. 500'`, the exact format the SUT prints (no thousands separator). */
export function formatPrice(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError(`A price must be a non-negative integer, received ${amount}.`);
  }
  return `${CURRENCY_PREFIX} ${amount}`;
}
