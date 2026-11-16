/**
 * SQAF — Account API layer entry point (Stage 3). See ADR-0009.
 * Only the Fixtures layer imports it.
 */
export {
  ACCOUNT_ENDPOINTS,
  AccountApiClient,
  registrationForm,
  type AccountApiClientOptions,
  type AccountCredentials,
  type AccountRegistration,
  type AccountSummary,
  type DeleteOutcome,
} from './account.client';
