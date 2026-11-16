import { expect, test } from '@playwright/test';
import { DataValidationError } from '../../../src/errors';
import {
  arrayOf,
  boolean,
  integer,
  nonEmptyString,
  object,
  oneOf,
  optional,
  validate,
} from '../../../src/data/validation/schema';
import { invalidCredentialsCaseSchema, productSchema, userAccountSchema } from '../../../src/data/validation/schemas';

/** Stage 3 — dependency-free runtime schemas (ADR-0009). */

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(DataValidationError);
    return (error as DataValidationError).issues;
  }
  throw new Error('expected a DataValidationError');
}

const person = object({
  name: nonEmptyString(),
  age: integer({ min: 0 }),
  admin: boolean,
  role: oneOf(['a', 'b'] as const),
  nickname: optional(nonEmptyString()),
});

test('returns a typed, frozen copy of a valid value', () => {
  const value = validate(person, { name: 'Ana', age: 30, admin: false, role: 'a' }, 'inline');
  expect(value).toEqual({ name: 'Ana', age: 30, admin: false, role: 'a' });
  expect(Object.isFrozen(value)).toBe(true);
  expect('nickname' in value).toBe(false);
});

test('reports EVERY issue with its JSON path, in one DataValidationError', () => {
  const issues = issuesOf(() =>
    validate(person, { name: '', age: -1, admin: 'yes', role: 'c', nickname: 3, pasword: 'typo' }, 'inline'),
  );
  expect(issues).toEqual([
    '$.pasword: unknown field',
    '$.name: expected a non-empty string, received an empty string',
    '$.age: expected an integer >= 0, received number -1',
    '$.admin: expected a boolean, received a string',
    '$.role: expected one of "a", "b", received "c"',
    '$.nickname: expected a non-empty string, received number 3',
  ]);
});

test('missing required fields are reported, optional ones are not', () => {
  expect(issuesOf(() => validate(person, { name: 'Ana' }, 'inline'))).toEqual([
    '$.age: missing required field (expected an integer >= 0)',
    '$.admin: missing required field (expected a boolean)',
    '$.role: missing required field (expected one of "a", "b")',
  ]);
});

test('arrays: item paths, minimum length and unique ids', () => {
  const list = arrayOf(object({ id: nonEmptyString() }), { minLength: 1, uniqueBy: 'id' });
  expect(issuesOf(() => validate(list, [], 'inline'))).toEqual(['$: expected at least 1 item(s), received 0']);
  expect(issuesOf(() => validate(list, [{ id: 'a' }, { id: 7 }, { id: 'a' }], 'inline'))).toEqual([
    '$[1].id: expected a non-empty string, received number 7',
    '$[2].id: duplicated value "a" (first at [0])',
  ]);
  expect(issuesOf(() => validate(list, { id: 'a' }, 'inline'))).toEqual(['$: expected an array, received an object']);
});

test('the error names its source and never prints the invalid value itself', () => {
  try {
    validate(object({ password: nonEmptyString({ pattern: /^\d+$/ }) }), { password: 'S3cr3t!' }, 'users/x.json');
    throw new Error('not thrown');
  } catch (error) {
    const dataError = error as DataValidationError;
    expect(dataError.classification).toBe('test-data/invalid');
    expect(dataError.source).toBe('users/x.json');
    expect(dataError.message).toContain('Source: users/x.json');
    expect(dataError.message).not.toContain('S3cr3t!');
  }
});

test.describe('domain schemas', () => {
  test('e-mails must be synthetic (reserved domains only)', () => {
    const base = { id: 'c', description: 'd', password: 'p', expectedError: 'e' };
    for (const email of ['sqaf.a@example.com', 'a+b@sub.example.org', 'x@domain.invalid', 'y@site.test']) {
      expect(() => validate(invalidCredentialsCaseSchema, { ...base, email }, 'inline'), email).not.toThrow();
    }
    for (const email of ['someone@gmail.com', 'not-an-email', 'a@example.co']) {
      expect(() => validate(invalidCredentialsCaseSchema, { ...base, email }, 'inline'), email).toThrow(DataValidationError);
    }
  });

  test('products need a positive id, an integer price and a "A > B" category', () => {
    const issues = issuesOf(() =>
      validate(productSchema, { id: 0, name: 'X', price: 5.5, brand: 'B', category: 'Women' }, 'inline'),
    );
    expect(issues).toHaveLength(3);
  });

  test('a user account requires every field of the registration form', () => {
    const issues = issuesOf(() => validate(userAccountSchema, { email: 'sqaf.a@example.com' }, 'inline'));
    expect(issues.length).toBeGreaterThan(10);
    expect(issues).toContain('$.password: missing required field (expected a non-empty password)');
  });
});
