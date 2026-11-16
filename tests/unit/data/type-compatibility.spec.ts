import { expect, test } from '@playwright/test';
import type { AccountCredentials, AccountRegistration } from '../../../src/api';
import { buildUserAccount, type Credentials, type InvalidCredentialsCase, type UserAccount } from '../../../src/data';
import type { AccountDetails, LoginCredentials, SignupIdentity } from '../../../src/pages';

/**
 * Stage 3 — D9 contract (ADR-0007, ADR-0009), checked by the COMPILER.
 *
 * The Page Objects and the API client declare structural inputs; the data
 * layer must produce objects assignable to them. If either side changes in an
 * incompatible way, `npm run typecheck` fails on the lines below.
 */

type Assignable<From, To> = [From] extends [To] ? true : false;
const proof = <T extends true>(): T => true as T;

const contract = {
  userIsLogin: proof<Assignable<UserAccount, LoginCredentials>>(),
  userIsSignupIdentity: proof<Assignable<UserAccount, SignupIdentity>>(),
  userIsAccountDetails: proof<Assignable<UserAccount, AccountDetails>>(),
  userIsApiRegistration: proof<Assignable<UserAccount, AccountRegistration>>(),
  userIsApiCredentials: proof<Assignable<UserAccount, AccountCredentials>>(),
  credentialsAreLogin: proof<Assignable<Credentials, LoginCredentials>>(),
  invalidCaseIsLogin: proof<Assignable<InvalidCredentialsCase, LoginCredentials>>(),
};

test('one UserAccount fits every Page Object and API input (D9)', () => {
  expect(Object.values(contract).every(Boolean)).toBe(true);
  const user = buildUserAccount({ dataId: 'user-t-1', password: 'p' });
  const details: AccountDetails = user;
  const identity: SignupIdentity = user;
  const registration: AccountRegistration = user;
  expect([details.city, identity.email, registration.name]).toEqual(['Toronto', 'sqaf.user-t-1@example.com', 'SQAF Tester']);
});
