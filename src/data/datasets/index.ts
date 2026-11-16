import type {
  AccountProfile,
  DataCase,
  InvalidCredentialsCase,
  PaymentCard,
  Product,
  ProductSearchCase,
} from '../types';
import type { Schema } from '../validation/schema';
import {
  accountProfileSchema,
  invalidCredentialsCaseSchema,
  paymentCardSchema,
  productSchema,
  productSearchCaseSchema,
} from '../validation/schemas';

/**
 * SQAF — Dataset catalog (Stage 3). See ADR-0009.
 *
 * Single list of the JSON datasets under `test-data/`: file (relative to the
 * dataset root) and the schema of each item. Adding a dataset means adding a
 * JSON file and one entry here; providers and tests pick it up from here.
 */

export interface DatasetDefinition<T extends DataCase> {
  /** Path relative to the dataset root, POSIX separators. */
  readonly file: string;
  readonly item: Schema<T>;
}

function dataset<T extends DataCase>(file: string, item: Schema<T>): DatasetDefinition<T> {
  return Object.freeze({ file, item });
}

export const DATASETS = Object.freeze({
  invalidCredentials: dataset<InvalidCredentialsCase>('users/invalid-credentials.json', invalidCredentialsCaseSchema),
  accountProfiles: dataset<AccountProfile>('users/account-profiles.json', accountProfileSchema),
  products: dataset<Product>('products/catalog.json', productSchema),
  productSearches: dataset<ProductSearchCase>('products/search-terms.json', productSearchCaseSchema),
  paymentCards: dataset<PaymentCard>('checkout/payment-cards.json', paymentCardSchema),
});

export type DatasetName = keyof typeof DATASETS;
