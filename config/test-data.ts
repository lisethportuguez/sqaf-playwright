import { resolve } from 'node:path';

/**
 * SQAF — Test data location (Stage 3). See ADR-0009.
 *
 * Static datasets are JSON files under `test-data/` at the repository root,
 * grouped by domain (users, products, checkout). They are read and validated
 * by the Test Data Management layer (`src/data`); nothing else reads them.
 */
export interface TestDataPolicy {
  /** Absolute path of the dataset root directory. */
  readonly rootDir: string;
}

export const SQAF_TEST_DATA: TestDataPolicy = Object.freeze({
  rootDir: resolve(__dirname, '..', 'test-data'),
});
