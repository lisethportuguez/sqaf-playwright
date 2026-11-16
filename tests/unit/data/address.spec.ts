import { expect, test } from '@playwright/test';
import { buildUserAccount, expectedAddressLines, testData } from '../../../src/data';

/** Stage 4 (E4.3, TC23) — expected address lines of the checkout page (pure function). */

const identity = { dataId: 'user-unit-address-1', password: 'not-a-real-secret' };

test('the default profile gives the seven lines in page order', () => {
  const user = buildUserAccount(identity);
  expect(expectedAddressLines(user)).toEqual([
    'Mrs. Ana Tester',
    'SQAF',
    'Avenida Central 100',
    'Edificio 2',
    'Toronto Ontario M5H 2N2',
    'Canada',
    '4165550100',
  ]);
});

test('missing optional fields stay as EMPTY lines (the SUT always renders seven)', () => {
  const user = buildUserAccount(identity, {}, testData.accountProfiles.byId('united-states-minimal'));
  expect(expectedAddressLines(user)).toEqual([
    'Mr. Luis Minimal',
    '',
    '200 Example Street',
    '',
    'San Francisco California 94105',
    'United States',
    '4155550100',
  ]);
});

test('whitespace is normalized like toHaveText, and overrides are honoured', () => {
  const user = buildUserAccount(identity, { firstName: '  Ana  María ', city: 'São  Paulo', state: 'SP', zipcode: '01000-000' });
  const lines = expectedAddressLines(user);
  expect(lines[0]).toBe('Mrs. Ana María Tester');
  expect(lines[4]).toBe('São Paulo SP 01000-000');
});

test('pure: same input, same output; frozen; never includes the e-mail or the password', () => {
  const user = buildUserAccount(identity);
  const lines = expectedAddressLines(user);
  expect(expectedAddressLines(user)).toEqual(lines);
  expect(Object.isFrozen(lines)).toBe(true);
  expect(lines.join('\n')).not.toContain(user.email);
  expect(lines.join('\n')).not.toContain(user.password);
});
