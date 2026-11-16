import { test as base, type BrowserContext, type TestInfo } from '@playwright/test';
import { ConfigurationError, credentialEvidenceViolations, sqafConfig } from '../../config';
import { AccountApiClient, type DeleteOutcome } from '../api';
import { newUserAccount, type UserAccount } from '../data';
import { ApiError } from '../errors/api-error';
import { redactSecrets, redactValues } from '../utils/redaction';

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
 *
 * Credential safety (ADR-0009 D16). accountApi, newUserData and testUser
 * handle passwords, so they depend on `credentialGuard`, which:
 *  1. REFUSES to run unless the spec file declares the credential-safe
 *     evidence policy (`test.use(CREDENTIAL_SAFE_EVIDENCE)`: no trace, no
 *     video): the trace would store the API form bodies and the DOM value of
 *     password inputs. No account is created when the policy is wrong.
 *  2. After the test, empties every password input of the browser context,
 *     before Playwright closes it and takes its page snapshot
 *     (`error-context.md`).
 *  3. Redacts the registered passwords (and any `password=…` pair) in the
 *     errors of the test, which Playwright later writes to error-context.md,
 *     the console and the reports.
 * Tests that do not use these fixtures keep the general evidence policy.
 */

export interface DataOptions {
  readonly userProfile: string;
}

/** Registers the secrets a test handles, so they are redacted from its errors. */
export interface CredentialGuard {
  register(secret: string): void;
}

export interface DataFixtures {
  readonly credentialGuard: CredentialGuard;
  readonly accountApi: AccountApiClient;
  readonly newUserData: UserAccount;
  readonly testUser: UserAccount;
}

export const ACCOUNT_CLEANUP_ATTACHMENT = 'sqaf-account-cleanup';

/**
 * Evidence options of the tests that handle credentials. Declare it at the
 * TOP LEVEL of the spec file (`video` cannot change inside a describe):
 *
 *   test.use(CREDENTIAL_SAFE_EVIDENCE);
 */
export const CREDENTIAL_SAFE_EVIDENCE = Object.freeze({
  trace: sqafConfig.credentialEvidence.trace,
  screenshot: sqafConfig.credentialEvidence.screenshot,
  video: sqafConfig.credentialEvidence.video,
});

const STRING_FIELDS = ['message', 'stack', 'value', 'errorContext'] as const;

/** Redacts secrets in Playwright's serialized errors of the test (and their causes), in place. */
export function redactTestErrors(errors: readonly object[], secrets: readonly string[]): void {
  const visit = (error: unknown, depth: number): void => {
    if (typeof error !== 'object' || error === null || depth > 8) return;
    const record = error as Record<string, unknown>;
    for (const field of STRING_FIELDS) {
      const value = record[field];
      if (typeof value === 'string') record[field] = redactSecrets(redactValues(value, secrets));
    }
    visit(record['cause'], depth + 1);
  };
  for (const error of errors) visit(error, 0);
}

/** Empties every password input of the context (best effort: a page may be closed or navigating). */
async function clearPasswordInputs(context: BrowserContext): Promise<void> {
  for (const page of context.pages()) {
    for (const frame of page.frames()) {
      await frame
        .evaluate(() => {
          for (const input of Array.from(document.querySelectorAll('input[type="password"]'))) {
            (input as HTMLInputElement).value = '';
          }
        })
        .catch(() => undefined);
    }
  }
}

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

  credentialGuard: async ({ trace, video, screenshot, context }, use, testInfo) => {
    const violations = credentialEvidenceViolations({ trace, video, screenshot });
    if (violations.length > 0) {
      throw new ConfigurationError(
        `This test handles account credentials but its evidence policy can store them: ${violations.join('; ')}. ` +
          'Declare test.use(CREDENTIAL_SAFE_EVIDENCE) at the top of the spec file (ADR-0009 D16).',
      );
    }
    const secrets: string[] = [];
    await use({
      register(secret: string): void {
        if (secret.length > 0) secrets.push(secret);
      },
    });
    // Runs after the user fixtures (they depend on this one) and before the
    // context closes, when Playwright takes the page snapshot.
    await clearPasswordInputs(context);
    redactTestErrors(testInfo.errors, secrets);
  },

  accountApi: async ({ request, credentialGuard }, use) => {
    void credentialGuard; // dependency only: the guard must run first
    await use(new AccountApiClient(request, { timeout: sqafConfig.api.timeout }));
  },

  newUserData: async ({ userProfile, accountApi, credentialGuard }, use, testInfo) => {
    const user = newUserAccount({}, { profileId: userProfile });
    credentialGuard.register(user.password);
    annotate(testInfo, 'newUserData', user);
    await use(user);
    // Idempotent safety net: 'not-found' when the test never registered the user.
    const deleteOutcome = await accountApi.deleteAccount(user);
    await recordCleanup(testInfo, { fixture: 'newUserData', dataId: user.dataId, email: user.email, deleteOutcome });
  },

  testUser: async ({ userProfile, accountApi, credentialGuard }, use, testInfo) => {
    const user = newUserAccount({}, { profileId: userProfile });
    credentialGuard.register(user.password);
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
