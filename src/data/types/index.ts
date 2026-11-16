/**
 * SQAF — Test data types (Stage 3). See ADR-0009.
 *
 * The Page Objects declare their own STRUCTURAL input interfaces
 * (`LoginCredentials`, `SignupIdentity`, `AccountDetails`, ADR-0007 D9) and
 * `src/data` must not import `src/pages` (sibling layers). These types are
 * therefore the data-side model, designed so that ONE `UserAccount` object is
 * assignable to all three page interfaces and to the API registration input.
 * The compatibility is checked at compile time in
 * tests/unit/data/type-compatibility.spec.ts, so the two sides cannot drift.
 */

export type Title = 'Mr' | 'Mrs';

/** Values of the day/month/year `<select>` options of the SUT, for example `10`, `5`, `1995`. */
export interface BirthDate {
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

/** Reusable, non-unique part of a user: everything except e-mail and password. */
export interface AccountProfile {
  readonly id: string;
  readonly description: string;
  /** Display name used in the signup form ("Logged in as <name>"). */
  readonly name: string;
  readonly title: Title;
  readonly birthDate: BirthDate;
  readonly newsletter: boolean;
  readonly specialOffers: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string;
  readonly address: string;
  readonly address2?: string;
  /** Visible option of the SUT country `<select>`, for example `Canada`. */
  readonly country: string;
  readonly state: string;
  readonly city: string;
  readonly zipcode: string;
  readonly mobileNumber: string;
}

/** A complete, unique test user: a profile plus generated e-mail and password. */
export interface UserAccount extends Credentials, Omit<AccountProfile, 'id' | 'description'> {
  /** Unique data id (`user-<runToken>-<n>`), safe to log; the e-mail is derived from it. */
  readonly dataId: string;
  /** Profile the user was built from. */
  readonly profileId: string;
}

/** Overrides accepted by the user factory: any field, `birthDate` partially. */
export type UserAccountOverrides = Partial<Omit<UserAccount, 'birthDate' | 'dataId' | 'profileId'>> & {
  readonly birthDate?: Partial<BirthDate>;
};

/** Data-driven case: credentials that must be rejected by the login form. */
export interface InvalidCredentialsCase extends Credentials {
  readonly id: string;
  readonly description: string;
  /** Error text the SUT shows. */
  readonly expectedError: string;
}

/** Product of the SUT catalog (source: `GET /api/productsList`). */
export interface Product {
  readonly id: number;
  readonly name: string;
  /** Price in rupees; the SUT prints it as `Rs. <price>`. */
  readonly price: number;
  readonly brand: string;
  /** As shown on the product page, for example `Women > Tops`. */
  readonly category: string;
}

/** Data-driven case: a search term and the exact products it must return. */
export interface ProductSearchCase {
  readonly id: string;
  readonly description: string;
  readonly term: string;
  readonly expectedProducts: readonly string[];
}

/** Section (panel) of the category sidebar. */
export type CategorySection = 'Women' | 'Men' | 'Kids';

/** Data-driven case (Stage 4, TC18): a sidebar category and the exact products of its page. */
export interface ProductCategory {
  readonly id: string;
  readonly description: string;
  /** Sidebar panel that contains the category link. */
  readonly section: CategorySection;
  /** Text of the category link inside the panel, for example `Dress`. */
  readonly name: string;
  /** Id in the category page URL (`/category_products/<id>`). */
  readonly categoryId: number;
  /** Heading of the category page: `<section> - <name> Products`. */
  readonly heading: string;
  /** Names of every product of the category page, in page order. */
  readonly expectedProducts: readonly string[];
}

/** Test payment card for the checkout. Fictitious: never a real card. */
export interface PaymentCard {
  readonly id: string;
  readonly description: string;
  readonly nameOnCard: string;
  readonly cardNumber: string;
  readonly cvc: string;
  readonly expiryMonth: string;
  readonly expiryYear: string;
}

/** A cart line computed from catalog data, for expected cart values. */
export interface CartLine {
  readonly product: Product;
  readonly quantity: number;
  readonly total: number;
}

/** Every dataset case has a unique id, used in data-driven test titles. */
export interface DataCase {
  readonly id: string | number;
  readonly description?: string;
}
