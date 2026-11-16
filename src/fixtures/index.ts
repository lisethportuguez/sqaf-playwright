import { mergeTests } from '@playwright/test';
import { test as contextTest } from './context.fixture';
import { test as dataTest } from './data.fixture';
import { test as httpEvidenceTest } from './http-evidence.fixture';
import { test as flowsTest } from './flows.fixture';

/**
 * SQAF — Fixtures layer entry point (Stages 2-4). See ADR-0007, ADR-0009 and ADR-0010.
 *
 * THE single import of every SQAF test suite (tests/integration, tests/e2e):
 *
 *   import { test, expect, testData, caseTitle } from '@sqaf/fixtures';
 *
 * Exports `test` (Page Object, user flow, context and data fixtures), `expect`,
 * the scenario catalog of Stage 4 (`scenario`), the
 * read-only data providers and factories that data-driven suites need at
 * collection time, and the input data types. Page Object classes and the API
 * client stay internal and reach the tests through fixtures.
 */
export const test = mergeTests(contextTest, httpEvidenceTest, flowsTest, dataTest);
export { expect } from '@playwright/test';
export type { AccountDetails, LoginCredentials, PaymentDetails, SignupIdentity } from '../pages';

// Stage 3: test data for data-driven suites (ADR-0009).
export {
  cartLine,
  cartLineTexts,
  cartTotal,
  caseTitle,
  credentialsOf,
  expectedAddressLines,
  testData,
  unregisteredCredentials,
  wrongPasswordFor,
} from '../data';
export type {
  AccountProfile,
  CartLine,
  Credentials,
  InvalidCredentialsCase,
  CategorySection,
  PaymentCard,
  Product,
  ProductCategory,
  ProductSearchCase,
  UserAccount,
} from '../data';
export {
  ACCOUNT_CLEANUP_ATTACHMENT,
  CREDENTIAL_SAFE_EVIDENCE,
  type AccountCleanupRecord,
} from './data.fixture';

// Stage 4: user flows, the scenario catalog and the price format of the SUT (ADR-0010).
export { formatPrice } from '../utils/price';
export type { FlowFixtures, UiRegistration, UserFlows } from './flows.fixture';
export {
  BASELINE_PAIR_ANNOTATION,
  CHECKOUT_TIMEOUT,
  OFFICIAL_TEST_CASES_URL,
  SCENARIOS,
  scenario,
  TEST_CASE_ANNOTATION,
  type Scenario,
  type ScenarioArea,
  type ScenarioBlock,
  type ScenarioDefinition,
  type ScenarioId,
} from './scenarios';
