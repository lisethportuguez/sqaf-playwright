import { DataValidationError } from '../../errors/data-validation-error';
import { describeValue, isInteger, isNonEmptyString, isRecord } from '../../utils/guards';

/**
 * SQAF — Minimal runtime schemas for test data (Stage 3). See ADR-0009.
 *
 * JSON is untyped at runtime, so every dataset and every factory result is
 * checked against a schema before a test sees it. This module is a small,
 * dependency-free alternative to a schema library: each schema VALIDATES and
 * TYPES a value at the same time, and reports ALL issues (with their JSON
 * path) instead of stopping at the first one.
 *
 * Objects are strict: an unknown field is an issue, so a typo in a JSON file
 * (`"pasword"`) is reported instead of being silently ignored.
 */

export interface Schema<T> {
  /** Checks `value`, appends every issue found and returns it typed. */
  check(value: unknown, path: string, issues: string[]): T;
  /** Human-readable expectation, used in issue messages. */
  readonly expected: string;
}

/** Type described by a schema. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

function schema<T>(expected: string, check: Schema<T>['check']): Schema<T> {
  return Object.freeze({ expected, check });
}

function issue(issues: string[], path: string, expected: string, value: unknown): void {
  issues.push(`${path}: expected ${expected}, received ${describeValue(value)}`);
}

export interface StringOptions {
  readonly pattern?: RegExp;
  readonly maxLength?: number;
  /** Description of the pattern, for example `an e-mail address`. */
  readonly description?: string;
}

export function nonEmptyString(options: StringOptions = {}): Schema<string> {
  const expected = options.description ?? 'a non-empty string';
  return schema(expected, (value, path, issues) => {
    if (!isNonEmptyString(value)) {
      issue(issues, path, expected, value);
    } else if (options.pattern && !options.pattern.test(value)) {
      issues.push(`${path}: expected ${expected}, received a string that does not match ${options.pattern}`);
    } else if (options.maxLength !== undefined && value.length > options.maxLength) {
      issues.push(`${path}: expected at most ${options.maxLength} characters, received ${value.length}`);
    }
    return value as string;
  });
}

export function integer(options: { readonly min?: number; readonly max?: number } = {}): Schema<number> {
  const range = [
    options.min !== undefined ? `>= ${options.min}` : '',
    options.max !== undefined ? `<= ${options.max}` : '',
  ].filter(Boolean);
  const expected = `an integer${range.length ? ` ${range.join(' and ')}` : ''}`;
  return schema(expected, (value, path, issues) => {
    const outOfRange =
      isInteger(value) &&
      ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max));
    if (!isInteger(value) || outOfRange) issue(issues, path, expected, value);
    return value as number;
  });
}

export const boolean: Schema<boolean> = schema('a boolean', (value, path, issues) => {
  if (typeof value !== 'boolean') issue(issues, path, 'a boolean', value);
  return value as boolean;
});

export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
  const expected = `one of ${values.map((v) => `"${v}"`).join(', ')}`;
  return schema(expected, (value, path, issues) => {
    if (typeof value !== 'string' || !values.includes(value)) {
      issues.push(`${path}: expected ${expected}, received ${typeof value === 'string' ? `"${value}"` : describeValue(value)}`);
    }
    return value as T[number];
  });
}

/** Marks an object field as optional (absent or undefined). */
export interface OptionalSchema<T> extends Schema<T | undefined> {
  readonly optional: true;
}

export function optional<T>(inner: Schema<T>): OptionalSchema<T> {
  return Object.freeze({
    optional: true as const,
    expected: `${inner.expected} (optional)`,
    check: (value: unknown, path: string, issues: string[]) =>
      value === undefined ? undefined : inner.check(value, path, issues),
  });
}

type Shape = Readonly<Record<string, Schema<unknown>>>;
type OptionalKeys<S extends Shape> = { [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never }[keyof S];
type RequiredKeys<S extends Shape> = Exclude<keyof S, OptionalKeys<S>>;

/** Readonly object type of a shape: optional schemas become optional properties. */
export type ObjectOf<S extends Shape> = {
  readonly [K in RequiredKeys<S>]: Infer<S[K]>;
} & {
  readonly [K in OptionalKeys<S>]?: Exclude<Infer<S[K]>, undefined>;
};

export function object<S extends Shape>(shape: S): Schema<ObjectOf<S>> {
  const expected = 'an object';
  return schema(expected, (value, path, issues) => {
    if (!isRecord(value)) {
      issue(issues, path, expected, value);
      return value as ObjectOf<S>;
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) issues.push(`${path}.${key}: unknown field`);
    }
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(shape)) {
      if (!(key in value) && !('optional' in field)) {
        issues.push(`${path}.${key}: missing required field (expected ${field.expected})`);
        continue;
      }
      const checked = field.check(value[key], `${path}.${key}`, issues);
      if (checked !== undefined) out[key] = checked;
    }
    return Object.freeze(out) as ObjectOf<S>;
  });
}

export interface ArrayOptions<T> {
  readonly minLength?: number;
  /** Field that must be unique across the items, for example `id`. */
  readonly uniqueBy?: keyof T & string;
}

export function arrayOf<T>(item: Schema<T>, options: ArrayOptions<T> = {}): Schema<readonly T[]> {
  const expected = 'an array';
  return schema(expected, (value, path, issues) => {
    if (!Array.isArray(value)) {
      issue(issues, path, expected, value);
      return [];
    }
    if (options.minLength !== undefined && value.length < options.minLength) {
      issues.push(`${path}: expected at least ${options.minLength} item(s), received ${value.length}`);
    }
    const items = value.map((entry, index) => item.check(entry, `${path}[${index}]`, issues));
    if (options.uniqueBy) {
      const key = options.uniqueBy;
      const seen = new Map<unknown, number>();
      items.forEach((entry, index) => {
        const id = isRecord(entry) ? entry[key] : undefined;
        if (id === undefined) return;
        const first = seen.get(id);
        if (first !== undefined) issues.push(`${path}[${index}].${key}: duplicated value "${String(id)}" (first at [${first}])`);
        else seen.set(id, index);
      });
    }
    return Object.freeze(items);
  });
}

/**
 * Validates `value` and returns it typed, or throws ONE DataValidationError
 * that lists every issue. `source` names the dataset or factory.
 */
export function validate<T>(target: Schema<T>, value: unknown, source: string): T {
  const issues: string[] = [];
  const checked = target.check(value, '$', issues);
  if (issues.length > 0) throw new DataValidationError({ source, issues });
  return checked;
}
