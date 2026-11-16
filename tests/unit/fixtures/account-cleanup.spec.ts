import { expect, test } from '@playwright/test';
import { ApiError } from '../../../src/errors';
import { ACCOUNT_CLEANUP_ATTACHMENT, cleanUpAccount, type CleanupApi } from '../../../src/fixtures/data.fixture';

/**
 * Stage 4 (ADR-0010 D5) — account cleanup of `newUserData` and `testUser`:
 * delete, verify with API 14 that the account no longer exists, attach the
 * record, and fail if the account is still there. Fake API, no SUT.
 */
const USER = Object.freeze({ dataId: 'user-unit-1', email: 'sqaf.user-unit-1@example.com', password: 'not-a-real-secret' });

function fakeApi(outcome: 'deleted' | 'not-found', stillThere: boolean): CleanupApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async deleteAccount() {
      calls.push('delete');
      return outcome;
    },
    async findAccountByEmail(email: string) {
      calls.push('find');
      return stillThere ? { id: 1, name: 'n', email } : undefined;
    },
  };
}

function fakeTestInfo(): { attach: (name: string, options: { body?: string | Buffer }) => Promise<void>; attached: Array<{ name: string; body: string }> } {
  const attached: Array<{ name: string; body: string }> = [];
  return {
    attached,
    async attach(name, options) {
      attached.push({ name, body: String(options.body) });
    },
  };
}

for (const fixture of ['newUserData', 'testUser'] as const) {
  for (const outcome of ['deleted', 'not-found'] as const) {
    test(`${fixture}: '${outcome}' and absent is a verified cleanup`, async () => {
      const api = fakeApi(outcome, false);
      const info = fakeTestInfo();
      const record = await cleanUpAccount(api, info, fixture, USER);
      expect(api.calls).toEqual(['delete', 'find']);
      // E4.5 security closure: no e-mail in the record; the data id identifies the account.
      expect(record).toEqual({ fixture, dataId: USER.dataId, deleteOutcome: outcome, verifiedAbsent: true });
      expect(info.attached).toHaveLength(1);
      expect(info.attached[0]!.name).toBe(ACCOUNT_CLEANUP_ATTACHMENT);
      expect(JSON.parse(info.attached[0]!.body)).toEqual(record);
      expect(info.attached[0]!.body).not.toContain(USER.password);
      expect(info.attached[0]!.body).not.toContain(USER.email);
      expect(info.attached[0]!.body).not.toContain('@');
    });
  }

  test(`${fixture}: an account that still exists fails the test with ApiError, after recording it`, async () => {
    const info = fakeTestInfo();
    const error = await cleanUpAccount(fakeApi('deleted', true), info, fixture, USER).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain(`Operation: ${fixture} cleanup`);
    expect((error as ApiError).message).not.toContain(USER.password);
    expect((error as ApiError).message).not.toContain(USER.email);
    expect(JSON.parse(info.attached[0]!.body)).toMatchObject({ fixture, verifiedAbsent: false });
    expect(info.attached[0]!.body).not.toContain(USER.email);
  });
}
