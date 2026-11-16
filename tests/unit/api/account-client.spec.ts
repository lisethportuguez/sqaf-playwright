import { expect, test } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { AccountApiClient, registrationForm } from '../../../src/api';
import { buildUserAccount } from '../../../src/data';
import { ApiError, InfrastructureError, SqafError } from '../../../src/errors';

/**
 * Stage 3 — AccountApiClient against a FAKE request context (no SUT).
 * Bodies reproduce the real answers observed on 2026-11-15: HTTP 200,
 * Content-Type text/html and the result in `responseCode`.
 */

interface Recorded {
  readonly url: string;
  readonly method: string | undefined;
  readonly form: Record<string, string> | undefined;
  readonly params: Record<string, string> | undefined;
  readonly timeout: number | undefined;
}

type Answer = { status?: number; statusText?: string; body: string } | Error;

function fakeRequest(answers: Answer[]): { request: APIRequestContext; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const request = {
    fetch: async (url: string, options: Record<string, unknown> = {}) => {
      calls.push({
        url,
        method: options['method'] as string | undefined,
        form: options['form'] as Record<string, string> | undefined,
        params: options['params'] as Record<string, string> | undefined,
        timeout: options['timeout'] as number | undefined,
      });
      const answer = answers.shift();
      if (!answer) throw new Error('unexpected request');
      if (answer instanceof Error) throw answer;
      return {
        status: () => answer.status ?? 200,
        statusText: () => answer.statusText ?? 'OK',
        text: async () => answer.body,
      } as unknown as APIResponse;
    },
  } as unknown as APIRequestContext;
  return { request, calls };
}

const user = buildUserAccount({ dataId: 'user-api-1', password: 'Sqaf#NeverLogged' });
const OPTIONS = { timeout: 15_000 };
const json = (value: unknown): { body: string } => ({ body: JSON.stringify(value) });

async function failure(run: () => Promise<unknown>): Promise<SqafError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(SqafError);
    return error as SqafError;
  }
  throw new Error('expected an SqafError');
}

test.describe('successful operations', () => {
  test('createAccount posts the documented form with the central timeout', async () => {
    const { request, calls } = fakeRequest([json({ responseCode: 201, message: 'User created!' })]);
    await new AccountApiClient(request, OPTIONS).createAccount(user);
    expect(calls).toEqual([
      { url: '/api/createAccount', method: 'POST', form: { ...registrationForm(user) }, params: undefined, timeout: 15_000 },
    ]);
    expect(Object.keys(calls[0]!.form!)).toEqual([
      'name', 'email', 'password', 'title', 'birth_date', 'birth_month', 'birth_year', 'firstname', 'lastname',
      'company', 'address1', 'address2', 'country', 'zipcode', 'state', 'city', 'mobile_number',
    ]);
  });

  test('findAccountByEmail returns the summary, or undefined on responseCode 404', async () => {
    const { request, calls } = fakeRequest([
      json({ responseCode: 200, user: { id: 42, name: user.name, email: user.email, title: 'Mrs' } }),
      json({ responseCode: 404, message: 'Account not found with this email, try another email!' }),
    ]);
    const client = new AccountApiClient(request, OPTIONS);
    await expect(client.findAccountByEmail(user.email)).resolves.toEqual({ id: 42, name: user.name, email: user.email });
    await expect(client.findAccountByEmail(user.email)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ url: '/api/getUserDetailByEmail', method: 'GET', params: { email: user.email } });
  });

  test('deleteAccount is idempotent: deleted, then not-found', async () => {
    const { request, calls } = fakeRequest([
      json({ responseCode: 200, message: 'Account deleted!' }),
      json({ responseCode: 404, message: 'Account not found!' }),
    ]);
    const client = new AccountApiClient(request, OPTIONS);
    await expect(client.deleteAccount(user)).resolves.toBe('deleted');
    await expect(client.deleteAccount(user)).resolves.toBe('not-found');
    expect(calls[0]).toMatchObject({ method: 'DELETE', form: { email: user.email, password: user.password } });
  });
});

test.describe('failures are classified, and never leak the password', () => {
  const cases: ReadonlyArray<readonly [string, Answer, string, typeof ApiError | typeof InfrastructureError]> = [
    ['an unexpected responseCode', json({ responseCode: 400, message: 'Email already exists!' }), 'api/request-failed', ApiError],
    ['JSON without responseCode', { body: '{"ok":true}' }, 'api/request-failed', ApiError],
    ['a body that is not JSON', { body: '<html><title>Oops</title></html>' }, 'api/request-failed', ApiError],
    ['an HTTP 5xx answer', { status: 503, statusText: 'Service Unavailable', body: 'down' }, 'infrastructure/sut-unavailable', InfrastructureError],
    ['a transport failure', new Error('apiRequestContext.fetch: getaddrinfo ENOTFOUND automationexercise.com\nCall log:\n  - → POST /api/createAccount'), 'infrastructure/network', InfrastructureError],
    [
      'an anti-bot challenge page',
      { status: 403, body: '<html><head><title>One moment, please...</title></head><body>Please wait while your request is being verified...</body></html>' },
      'infrastructure/anti-bot-challenge',
      InfrastructureError,
    ],
  ];

  for (const [label, answer, classification, type] of cases) {
    test(label, async () => {
      const { request } = fakeRequest([answer]);
      const error = await failure(() => new AccountApiClient(request, OPTIONS).createAccount(user));
      expect(error).toBeInstanceOf(type);
      expect(error.classification).toBe(classification);
      // Stage 4 (E4.5): the e-mail is redacted, with no data id (the repository and its CI logs are public).
      expect(error.message).toContain('Account: [e-mail redacted]');
      expect(error.message).not.toContain(user.dataId);
      expect(JSON.stringify(error)).not.toContain(user.dataId);
      expect(error.message).not.toContain(user.email);
      expect(JSON.stringify(error)).not.toContain(user.email);
      expect(error.message).not.toContain(user.password);
      expect(error.message).not.toContain('Call log');
    });
  }

  test('ApiError carries the API code and message', async () => {
    const { request } = fakeRequest([json({ responseCode: 400, message: 'Email already exists!' })]);
    const error = (await failure(() => new AccountApiClient(request, OPTIONS).createAccount(user))) as ApiError;
    expect([error.operation, error.endpoint, error.httpStatus, error.responseCode, error.responseMessage]).toEqual([
      'createAccount',
      '/api/createAccount',
      200,
      400,
      'Email already exists!',
    ]);
  });

  test('a user detail for another e-mail is rejected', async () => {
    const { request } = fakeRequest([json({ responseCode: 200, user: { id: 1, name: 'x', email: 'other@example.com' } })]);
    const error = await failure(() => new AccountApiClient(request, OPTIONS).findAccountByEmail(user.email));
    expect(error.classification).toBe('api/request-failed');
  });

  test('an unexpected delete answer is an ApiError, not a silent success', async () => {
    const { request } = fakeRequest([json({ responseCode: 400, message: 'Bad request' })]);
    const error = await failure(() => new AccountApiClient(request, OPTIONS).deleteAccount(user));
    expect(error).toBeInstanceOf(ApiError);
  });
});
