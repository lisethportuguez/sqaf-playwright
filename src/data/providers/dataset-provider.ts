import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sqafConfig } from '../../../config';
import { DataValidationError } from '../../errors/data-validation-error';
import { DATASETS, type DatasetDefinition } from '../datasets';
import type { DataCase } from '../types';
import { validate } from '../validation/schema';
import { datasetSchema } from '../validation/schemas';

/**
 * SQAF — Data providers (Stage 3). See ADR-0009.
 *
 * A provider loads ONE JSON dataset, validates it against its schema and
 * returns typed, frozen cases. Files are read lazily, once per worker
 * process, and every test receives the same immutable objects, so a test can
 * never alter the data of another.
 *
 * Any structural problem (missing file, invalid JSON, wrong field, duplicated
 * id, unknown case id) raises DataValidationError (`test-data/invalid`).
 *
 * Providers are synchronous on purpose: data-driven tests are generated at
 * collection time (`for (const c of provider.all()) test(...)`), before any
 * fixture exists.
 */

export interface DatasetProvider<T extends DataCase> {
  /** Dataset file relative to the dataset root. */
  readonly source: string;
  readonly description: string;
  /** Every case, in file order. */
  all(): readonly T[];
  /** One case by id; DataValidationError if it does not exist. */
  byId(id: T['id']): T;
  /** Cases matching a predicate; DataValidationError if none matches (an empty DDT loop would pass silently). */
  where(predicate: (item: T) => boolean, label: string): readonly T[];
}

interface Loaded<T> {
  readonly description: string;
  readonly items: readonly T[];
}

function readJson(path: string, source: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new DataValidationError({ source, issues: [`file not found or unreadable (${(error as NodeJS.ErrnoException).code ?? 'error'})`] });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DataValidationError({ source, issues: [`invalid JSON: ${(error as Error).message}`] });
  }
}

export function createDatasetProvider<T extends DataCase>(
  definition: DatasetDefinition<T>,
  rootDir: string = sqafConfig.testData.rootDir,
): DatasetProvider<T> {
  const source = definition.file;
  let loaded: Loaded<T> | undefined;

  const load = (): Loaded<T> => {
    if (!loaded) {
      const raw = readJson(join(rootDir, definition.file), source);
      const parsed = validate(datasetSchema(definition.item, 'id'), raw, source);
      loaded = Object.freeze({ description: parsed.description, items: parsed.items });
    }
    return loaded;
  };

  return Object.freeze({
    source,
    get description(): string {
      return load().description;
    },
    all: () => load().items,
    byId(id: T['id']): T {
      const found = load().items.find((item) => item.id === id);
      if (!found) {
        const known = load().items.map((item) => String(item.id)).join(', ');
        throw new DataValidationError({ source, issues: [`unknown case id "${String(id)}". Known ids: ${known}`] });
      }
      return found;
    },
    where(predicate: (item: T) => boolean, label: string): readonly T[] {
      const matches = load().items.filter(predicate);
      if (matches.length === 0) throw new DataValidationError({ source, issues: [`no case matches "${label}"`] });
      return Object.freeze(matches);
    },
  });
}

/** Providers of every dataset in the catalog, for the default dataset root. */
export const testData = Object.freeze({
  invalidCredentials: createDatasetProvider(DATASETS.invalidCredentials),
  accountProfiles: createDatasetProvider(DATASETS.accountProfiles),
  products: createDatasetProvider(DATASETS.products),
  productSearches: createDatasetProvider(DATASETS.productSearches),
  paymentCards: createDatasetProvider(DATASETS.paymentCards),
});

export type TestData = typeof testData;

/** Title of a data-driven test: `<base> [<case id>]`, unique per case. */
export function caseTitle(base: string, item: DataCase): string {
  return `${base} [${String(item.id)}]`;
}
