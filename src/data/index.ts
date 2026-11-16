/**
 * SQAF — Test Data Management layer entry point (Stage 3). See ADR-0009.
 *
 *   test-data/<domain>/*.json   static datasets (users, products, checkout)
 *   src/data/types              data model, compatible with the Page Object inputs (D9)
 *   src/data/validation         dependency-free schemas → DataValidationError
 *   src/data/datasets           catalog of datasets (file + schema)
 *   src/data/providers          typed, validated, frozen access to each dataset
 *   src/data/factories          unique users, credentials and expected cart values
 *
 * Only the Fixtures layer imports this module; suites reach the data through
 * `@sqaf/fixtures`.
 */
export { DATASETS, type DatasetDefinition, type DatasetName } from './datasets';
export { cartLine, cartLineTexts, cartTotal } from './factories/product.factory';
export { expectedAddressLines, type AddressSource } from './factories/address.factory';
export { credentialsOf, unregisteredCredentials, wrongPasswordFor } from './factories/credentials.factory';
export {
  buildUserAccount,
  DEFAULT_PROFILE_ID,
  newUserAccount,
  type NewUserOptions,
  type UserIdentity,
} from './factories/user.factory';
export {
  caseTitle,
  createDatasetProvider,
  testData,
  type DatasetProvider,
  type TestData,
} from './providers/dataset-provider';
export type * from './types';
export { validate, type Schema } from './validation/schema';
