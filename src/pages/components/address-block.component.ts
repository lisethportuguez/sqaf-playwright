import type { Locator } from '@playwright/test';

/**
 * SQAF — Delivery or billing address of the checkout page (Stage 4, TC23).
 *
 * SUT DOM (observed 2026-11-16, template of `/checkout`): a `<ul>` whose
 * first item is the heading ("Your delivery address" / "Your billing
 * address") followed by SEVEN lines, always present, empty when the field is
 * empty: name (`<title>. <first> <last>`), company, address 1, address 2,
 * `<city> <state> <zipcode>`, country and mobile number. The lines have no
 * names or data-qa, so they are read in order (see `expectedAddressLines`).
 */
export class AddressBlock {
  readonly heading: Locator;
  /** The seven address lines, in page order (the heading item excluded). */
  readonly lines: Locator;

  constructor(readonly root: Locator) {
    this.heading = root.getByRole('heading', { level: 3 });
    this.lines = root.getByRole('listitem').filter({ hasNot: root.page().getByRole('heading') });
  }
}
