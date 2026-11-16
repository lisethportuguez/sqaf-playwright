import { test as base, type TestInfo } from '@playwright/test';
import { sqafConfig } from '../../config';
import { AccountApiClient, type DeleteOutcome } from '../api';
import { newUserAccount, type UserAccount } from '../data';
import { ApiError } from '../errors/api-error';

/**
 * SQAF — Test data and account fixtures (Stage 3). See ADR-0009.
 *
 *  userProfile  OPTION. Profile id of `users/account-profiles.json` used by
 *               the user fixtures (default `default`). Data-driven suites
 *               switch it with `test.use({ userProfile: '<id>' })`.
 *  accountApi   AccountApiClient over the test's own `request` context.
 *  newUserData  A unique, validated user that does NOT exist in the SUT yet
 *               (for UI registration). Safety net: the teardown deletes the
 *               account through the API in case the test registered it, so a
 *               failing registration test never leaves an orphan account.
 *  testUser     A unique user that ALREADY exists: created through the API
 *               before the test, deleted through the API after it, and the
 *               deletion is verified (API 14 must answer 404).
 *
 * Every fixture is test-scoped: each test gets its own user and nothing is
 * shared between tests or workers (ADR-0007 D11). The cleanup result is
 * attached to the test (`sqaf-account-cleanup`) without the password.
 */

export interface DataOptions {
  readonly userProfile: string;
}

export interface DataFixtures {
  readonly accountApi: AccountApiClient;
  readonly newUserData: UserAccount;
  readonly testUser: UserAccount;
}

export const ACCOUNT_CLEANUP_ATTACHMENT = 'sqaf-account-cleanup';

export interface AccountCleanupRecord {
  readonly fixture: 'newUserData' | 'testUser';
  readonly dataId: string;
  readonly email: string;
  readonly deleteOutcome: DeleteOutcome;
  /** Only for testUser: API 14 confirmed that the account no longer exists. */
  readonly verifiedAbsent?: boolean;
}

async function recordCleanup(testInfo: TestInfo, record: AccountCleanupRecord): Promise<void> {
  await testInfo.attach(ACCOUNT_CLEANUP_ATTACHMENT, {
    contentType: 'application/json',
    body: JSON.stringify(record, null, 2),
  });
}

function annotate(testInfo: TestInfo, fixture: string, user: UserAccount): void {
  testInfo.annotations.push({
    type: 'sqaf-test-data',
    description: `${fixture}: ${user.dataId} (profile ${user.profileId})`,
  });
}

export const test = base.extend<DataOptions & DataFixtures>({
  userProfile: ['default', { option: true }],

  accountApi: async ({ request }, use) => {
    await use(new AccountApiClient(request, { timeout: sqafConfig.api.timeout }));
  },

  newUserData: async ({ userProfile, accountApi }, use, testInfo) => {
    const user = newUserAccount({}, { profileId: userProfile });
    annotate(testInfo, 'newUserData', user);
    await use(user);
    // Idempotent safety net: 'not-found' when the test never registered the user.
    const deleteOutcome = await accountApi.deleteAccount(user);
    await recordCleanup(testInfo, { fixture: 'newUserData', dataId: user.dataId, email: user.email, deleteOutcome });
  },

  testUser: async ({ userProfile, accountApi }, use, testInfo) => {
    const user = newUserAccount({}, { profileId: userProfile });
    annotate(testInfo, 'testUser', user);
    try {
      await accountApi.createAccount(user);
    } catch (error) {
      // The SUT may have stored the account even if the answer was lost or
      // unexpected: try to delete it, then fail with the ORIGINAL error.
      await accountApi.deleteAccount(user).catch(() => undefined);
      throw error;
    }

    await use(user);

    // 'not-found' is valid: the scenario may have deleted the account itself (UI "Delete Account").
    const deleteOutcome = await accountApi.deleteAccount(user);
    const remaining = await accountApi.findAccountByEmail(user.email);
    await recordCleanup(testInfo, {
      fixture: 'testUser',
      dataId: user.dataId,
      email: user.email,
      deleteOutcome,
      verifiedAbsent: remaining === undefined,
    });
    if (remaining !== undefined) {
      throw new ApiError({
        operation: 'testUser cleanup',
        method: 'GET',
        endpoint: '/api/getUserDetailByEmail',
        accountEmail: user.email,
        summary: 'The test account still exists after its deletion: delete it by hand.',
      });
    }
  },
});
