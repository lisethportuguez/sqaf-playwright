import { randomSecret, uniqueEmail, uniqueId, type IdSource } from '../../utils/unique';
import type { Credentials, UserAccount } from '../types';

/**
 * SQAF — Credentials factory (Stage 3). See ADR-0009.
 *
 * Login data derived from a user, or credentials that are guaranteed not to
 * belong to any account (a fresh synthetic e-mail). Static negative cases
 * live in the JSON dataset `users/invalid-credentials.json`.
 */

/** Only the login fields of a user (nothing else leaks into a login step). */
export function credentialsOf(user: Pick<UserAccount, 'email' | 'password'>): Credentials {
  return Object.freeze({ email: user.email, password: user.password });
}

/** Correct e-mail of an existing user with a password that is certainly different. */
export function wrongPasswordFor(user: Pick<UserAccount, 'email' | 'password'>): Credentials {
  let password = `Wrong#${randomSecret(9)}`;
  while (password === user.password) password = `Wrong#${randomSecret(9)}`;
  return Object.freeze({ email: user.email, password });
}

/** Credentials of an e-mail that was never registered (unique per call). */
export function unregisteredCredentials(idSource?: IdSource): Credentials {
  const id = idSource ? uniqueId('ghost', idSource) : uniqueId('ghost');
  return Object.freeze({ email: uniqueEmail(id), password: `Ghost#${randomSecret(9)}` });
}
