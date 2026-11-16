import { expect, test } from '@playwright/test';
import {
  buildUserAccount,
  cartLine,
  cartLineTexts,
  cartTotal,
  credentialsOf,
  newUserAccount,
  testData,
  unregisteredCredentials,
  wrongPasswordFor,
} from '../../../src/data';
import { DataValidationError } from '../../../src/errors';
import { createIdSource } from '../../../src/utils';

/** Stage 3 — data factories (ADR-0009): defaults, overrides, uniqueness, reproducibility. */

const IDENTITY = { dataId: 'user-k3x9-ab12cd34-1', password: 'Sqaf#fixed' };

test.describe('user factory', () => {
  test('builds a complete user from the default profile', () => {
    const user = buildUserAccount(IDENTITY);
    const { id: _id, description: _description, ...profile } = testData.accountProfiles.byId('default');
    expect(user).toEqual({
      ...profile,
      dataId: 'user-k3x9-ab12cd34-1',
      profileId: 'default',
      email: 'sqaf.user-k3x9-ab12cd34-1@example.com',
      password: 'Sqaf#fixed',
    });
    expect(Object.isFrozen(user)).toBe(true);
  });

  test('is deterministic: same identity, profile and overrides → same user', () => {
    expect(buildUserAccount(IDENTITY, { city: 'Ottawa' })).toEqual(buildUserAccount(IDENTITY, { city: 'Ottawa' }));
  });

  test('overrides only the given fields, birthDate partially', () => {
    const user = buildUserAccount(IDENTITY, { firstName: 'Eva', birthDate: { year: '2000' } });
    expect(user.firstName).toBe('Eva');
    expect(user.lastName).toBe('Tester');
    expect(user.birthDate).toEqual({ day: '10', month: '5', year: '2000' });
  });

  test('uses another profile, including one without optional fields', () => {
    const user = buildUserAccount(IDENTITY, {}, testData.accountProfiles.byId('united-states-minimal'));
    expect(user.profileId).toBe('united-states-minimal');
    expect(user.country).toBe('United States');
    expect('company' in user).toBe(false);
    expect('address2' in user).toBe(false);
  });

  test('an invalid override raises DataValidationError', () => {
    const invalid = { title: 'Dr', email: 'real.person@gmail.com', mobileNumber: '+1 555' } as unknown as Parameters<
      typeof buildUserAccount
    >[1];
    try {
      buildUserAccount(IDENTITY, invalid);
      throw new Error('not thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(DataValidationError);
      const issues = (error as DataValidationError).issues;
      expect(issues).toHaveLength(3);
      expect((error as DataValidationError).source).toBe('factory:user');
    }
  });

  test('newUserAccount: unique e-mails, reproducible ids with a fixed source, random secret passwords', () => {
    const source = createIdSource('fixed-token');
    const users = Array.from({ length: 200 }, () => newUserAccount({}, { idSource: source }));
    expect(new Set(users.map((u) => u.email)).size).toBe(200);
    expect(users[0]!.dataId).toBe('user-fixed-token-1');
    expect(users[199]!.dataId).toBe('user-fixed-token-200');
    expect(new Set(users.map((u) => u.password)).size).toBe(200);
    for (const user of users.slice(0, 5)) {
      expect(user.email).toMatch(/@example\.com$/);
      expect(user.password).not.toContain(user.dataId);
    }
  });

  test('newUserAccount without options uses the worker-wide source', () => {
    const [a, b] = [newUserAccount(), newUserAccount()];
    expect(a.email).not.toBe(b.email);
    expect(a.dataId.split('-').slice(1, 3)).toEqual(b.dataId.split('-').slice(1, 3)); // same run token
  });
});

test.describe('credentials factory', () => {
  const user = buildUserAccount(IDENTITY);

  test('credentialsOf keeps only e-mail and password', () => {
    expect(credentialsOf(user)).toEqual({ email: user.email, password: 'Sqaf#fixed' });
  });

  test('wrongPasswordFor keeps the e-mail and always changes the password', () => {
    const wrong = wrongPasswordFor(user);
    expect(wrong.email).toBe(user.email);
    expect(wrong.password).not.toBe(user.password);
  });

  test('unregisteredCredentials are unique and synthetic', () => {
    const source = createIdSource('ghost-run');
    expect(unregisteredCredentials(source).email).toBe('sqaf.ghost-ghost-run-1@example.com');
    expect(unregisteredCredentials(source).email).toBe('sqaf.ghost-ghost-run-2@example.com');
  });
});

test.describe('product factory', () => {
  const blueTop = testData.products.byId(1);
  const tshirt = testData.products.byId(2);

  test('cart lines and totals come from catalog prices', () => {
    const lines = [cartLine(blueTop), cartLine(tshirt, 3)];
    expect(lines.map((line) => line.total)).toEqual([500, 1200]);
    expect(cartTotal(lines)).toBe(1700);
    expect(cartLineTexts(lines[1]!)).toEqual({ price: 'Rs. 400', quantity: '3', total: 'Rs. 1200' });
  });

  test('rejects impossible quantities', () => {
    for (const quantity of [0, -1, 1.5]) expect(() => cartLine(blueTop, quantity)).toThrow(DataValidationError);
  });
});
