import { mergeTests } from '@playwright/test';
import { test as contextTest } from './context.fixture';
import { test as pagesTest } from './pages.fixture';

/**
 * SQAF — Fixtures layer entry point (Stage 2). See ADR-0007.
 *
 * THE single import of every SQAF test suite (tests/integration, tests/e2e):
 *
 *   import { test, expect } from '@sqaf/fixtures';
 *
 * Only `test`, `expect` and the input data types are exported; Page Object
 * classes stay internal and reach the tests through fixtures.
 */
export const test = mergeTests(contextTest, pagesTest);
export { expect } from '@playwright/test';
export type { AccountDetails, LoginCredentials, SignupIdentity } from '../pages';
