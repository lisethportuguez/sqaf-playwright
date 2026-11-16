import { mergeTests } from '@playwright/test';
import { test as contextTest } from './context.fixture';
import { test as dataTest } from './data.fixture';
import { test as httpEvidenceTest } from './http-evidence.fixture';
import { test as pagesTest } from './pages.fixture';

/**
 * SQAF — Fixtures layer entry point (Stages 2-3). See ADR-0007 and ADR-0009.
 *
 * THE single import of every SQAF test suite (tests/integration, tests/e2e):
 *
 *   import { test, expect, testData, caseTitle } from '@sqaf/fixtures';
 *
 * Exports `test` (Page Object, context and data fixtures), `expect`, the
 * read-only data providers and factories that data-driven suites need at
 * collection time, and the input data types. Page Object classes and the API
 * client stay internal and reach the tests through fixtures.
 */
export const test = mergeTests(contextTest, httpEvidenceTest, pagesTest, dataTest);
export { expect } from '@playwright/test';
export type { AccountDetails, LoginCredentials, SignupIdentity } from '../pages';

// Stage 3: test data for data-driven suites (ADR-0009).
export {
  cartLine,
  cartLineTexts,
  cartTotal,
  caseTitle,
  credentialsOf,
  testData,
  unregisteredCredentials,
  wrongPasswordFor,
} from '../data';
export type {
  AccountProfile,
  CartLine,
  Credentials,
  InvalidCredentialsCase,
  PaymentCard,
  Product,
  ProductSearchCase,
  UserAccount,
} from '../data';
export {
  ACCOUNT_CLEANUP_ATTACHMENT,
  CREDENTIAL_SAFE_EVIDENCE,
  type AccountCleanupRecord,
} from './data.fixture';
