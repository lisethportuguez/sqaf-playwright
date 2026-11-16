import { DataValidationError } from '../../errors/data-validation-error';
import { generatedPassword, uniqueEmail, uniqueId, type IdSource } from '../../utils/unique';
import { testData } from '../providers/dataset-provider';
import type { AccountProfile, UserAccount, UserAccountOverrides } from '../types';
import { validate } from '../validation/schema';
import { userAccountSchema } from '../validation/schemas';

/**
 * SQAF — User factory (Stage 3). See ADR-0009.
 *
 * Builds a complete UserAccount from a reusable profile (JSON dataset
 * `users/account-profiles.json`) plus a unique identity:
 *
 *  - `buildUserAccount` is PURE and deterministic: same id, password, profile
 *    and overrides → same object. Unit tests and reproductions use it.
 *  - `newUserAccount` is the convenience used by fixtures: it draws the next
 *    unique id from the worker's IdSource (utils/unique) and a random
 *    password. The password is the only random value and never affects the
 *    behaviour of a scenario; it is never logged.
 *
 * Every result is validated (an invalid override raises DataValidationError)
 * and frozen. E-mails are always synthetic (`sqaf.<id>@example.com`).
 */

export const DEFAULT_PROFILE_ID = 'default';
const SOURCE = 'factory:user';

export interface UserIdentity {
  /** Unique data id, for example `user-m3k2x1-9f8e7d6c-1`. */
  readonly dataId: string;
  readonly password: string;
}

export function buildUserAccount(
  identity: UserIdentity,
  overrides: UserAccountOverrides = {},
  profile: AccountProfile = testData.accountProfiles.byId(DEFAULT_PROFILE_ID),
): UserAccount {
  const { id: profileId, description: _description, ...profileFields } = profile;
  let email: string;
  try {
    email = uniqueEmail(identity.dataId);
  } catch (error) {
    throw new DataValidationError({ source: SOURCE, issues: [`$.dataId: ${(error as Error).message}`] });
  }
  const { birthDate, ...rest } = overrides;
  const candidate: UserAccount = {
    ...profileFields,
    dataId: identity.dataId,
    profileId,
    email,
    password: identity.password,
    ...rest,
    birthDate: { ...profile.birthDate, ...birthDate },
  };
  return validate(userAccountSchema, candidate, SOURCE);
}

export interface NewUserOptions {
  /** Profile id from `users/account-profiles.json` (default: `default`). */
  readonly profileId?: string;
  /** Id source; defaults to the worker-wide one. Tests pass a fixed source for reproducibility. */
  readonly idSource?: IdSource;
}

export function newUserAccount(overrides: UserAccountOverrides = {}, options: NewUserOptions = {}): UserAccount {
  const profile = testData.accountProfiles.byId(options.profileId ?? DEFAULT_PROFILE_ID);
  const dataId = options.idSource ? uniqueId('user', options.idSource) : uniqueId('user');
  return buildUserAccount({ dataId, password: generatedPassword() }, overrides, profile);
}
