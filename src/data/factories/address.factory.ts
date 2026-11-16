import type { UserAccount } from '../types';

/** The fields of a user that the checkout shows as its address. */
export type AddressSource = Pick<
  UserAccount,
  'title' | 'firstName' | 'lastName' | 'company' | 'address' | 'address2' | 'city' | 'state' | 'zipcode' | 'country' | 'mobileNumber'
>;

/**
 * SQAF — Expected address lines of the checkout page (Stage 4, TC23). Pure.
 *
 * The SUT renders the registration address as seven lines, always in this
 * order and always present (empty when the optional field is missing):
 *
 *   1. `<title>. <first name> <last name>`   (e.g. "Mrs. Ana Tester")
 *   2. company
 *   3. address
 *   4. address 2
 *   5. `<city> <state> <zipcode>`
 *   6. country
 *   7. mobile number
 *
 * Whitespace is normalized the same way Playwright's `toHaveText` normalizes
 * the page text, so the lines can be compared directly.
 */
export function expectedAddressLines(user: AddressSource): readonly string[] {
  const join = (...parts: ReadonlyArray<string | undefined>): string =>
    parts
      .filter((part): part is string => part !== undefined)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  return Object.freeze([
    join(`${user.title}.`, user.firstName, user.lastName),
    join(user.company),
    join(user.address),
    join(user.address2),
    join(user.city, user.state, user.zipcode),
    join(user.country),
    join(user.mobileNumber),
  ]);
}
