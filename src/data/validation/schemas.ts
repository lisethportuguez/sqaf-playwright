import type {
  AccountProfile,
  BirthDate,
  InvalidCredentialsCase,
  PaymentCard,
  Product,
  ProductSearchCase,
  UserAccount,
} from '../types';
import { arrayOf, boolean, integer, nonEmptyString, object, oneOf, optional, type Schema } from './schema';

/**
 * SQAF — Schemas of every test data structure (Stage 3). See ADR-0009.
 *
 * Each schema is annotated with its type from `../types`, so the compiler
 * rejects a schema that does not produce that type.
 */

/** Synthetic e-mail on a reserved domain (RFC 2606), never a real mailbox. */
const SYNTHETIC_EMAIL = /^[a-z0-9][a-z0-9.+_-]*@(?:[a-z0-9-]+\.)*(?:example\.(?:com|org|net)|[a-z0-9-]+\.test|[a-z0-9-]+\.invalid)$/;
const CASE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGITS = /^\d+$/;

export const syntheticEmail = nonEmptyString({
  pattern: SYNTHETIC_EMAIL,
  maxLength: 254,
  description: 'a synthetic e-mail address on a reserved domain (example.com, *.test, *.invalid)',
});
const caseId = nonEmptyString({ pattern: CASE_ID, description: 'a kebab-case id' });
const digits = (description: string): Schema<string> => nonEmptyString({ pattern: DIGITS, description });

export const birthDateSchema: Schema<BirthDate> = object({
  day: digits('a day of month (digits)'),
  month: digits('a month number (digits)'),
  year: digits('a year (digits)'),
});

const profileFields = {
  name: nonEmptyString(),
  title: oneOf(['Mr', 'Mrs'] as const),
  birthDate: birthDateSchema,
  newsletter: boolean,
  specialOffers: boolean,
  firstName: nonEmptyString(),
  lastName: nonEmptyString(),
  company: optional(nonEmptyString()),
  address: nonEmptyString(),
  address2: optional(nonEmptyString()),
  country: nonEmptyString(),
  state: nonEmptyString(),
  city: nonEmptyString(),
  zipcode: nonEmptyString(),
  mobileNumber: digits('a phone number (digits only)'),
} as const;

export const accountProfileSchema: Schema<AccountProfile> = object({
  id: caseId,
  description: nonEmptyString(),
  ...profileFields,
});

export const userAccountSchema: Schema<UserAccount> = object({
  dataId: nonEmptyString(),
  profileId: caseId,
  email: syntheticEmail,
  password: nonEmptyString({ description: 'a non-empty password' }),
  ...profileFields,
});

export const invalidCredentialsCaseSchema: Schema<InvalidCredentialsCase> = object({
  id: caseId,
  description: nonEmptyString(),
  email: syntheticEmail,
  password: nonEmptyString(),
  expectedError: nonEmptyString(),
});

export const productSchema: Schema<Product> = object({
  id: integer({ min: 1 }),
  name: nonEmptyString(),
  price: integer({ min: 0 }),
  brand: nonEmptyString(),
  category: nonEmptyString({ pattern: /^\S.* > \S.*$/, description: 'a category like "Women > Tops"' }),
});

export const productSearchCaseSchema: Schema<ProductSearchCase> = object({
  id: caseId,
  description: nonEmptyString(),
  term: nonEmptyString(),
  expectedProducts: arrayOf(nonEmptyString(), { minLength: 1 }),
});

export const paymentCardSchema: Schema<PaymentCard> = object({
  id: caseId,
  description: nonEmptyString(),
  nameOnCard: nonEmptyString(),
  cardNumber: digits('a card number (digits)'),
  cvc: digits('a CVC (digits)'),
  expiryMonth: digits('a month (digits)'),
  expiryYear: digits('a year (digits)'),
});

/** Envelope of every JSON dataset: metadata plus the list of cases. */
export function datasetSchema<T>(item: Schema<T>, uniqueBy: keyof T & string) {
  return object({
    description: nonEmptyString(),
    /** Where the values come from (observation date, endpoint...). */
    source: optional(nonEmptyString()),
    items: arrayOf(item, { minLength: 1, uniqueBy }),
  });
}
