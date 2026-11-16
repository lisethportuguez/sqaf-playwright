import { expect, test } from '@playwright/test';
import { ApiError, DataValidationError, InfrastructureError, REDACTED, sanitizeCause, sanitizeContext } from '../../../src/errors';
import { generatedPassword, redactSecrets, redactValues } from '../../../src/utils';

/**
 * Stage 5 security adjustment (ADR-0008 D9): SqafError never carries a secret
 * in its message, its context (at any depth) or its cause chain.
 *
 * The secrets below are fake values built at runtime.
 */
const SECRET = generatedPassword();
const PLAIN = `plain-${Date.now().toString(36)}`;

test.describe('redactSecrets (text)', () => {
  test('redacts SQAF-generated passwords anywhere in a text', () => {
    expect(SECRET).toMatch(/^Sqaf#[A-Za-z0-9_-]{16}$/);
    expect(redactSecrets(`textbox "Password": ${SECRET}`)).toBe(`textbox "Password": ${REDACTED}`);
  });

  test('redacts form, query, JSON and header pairs', () => {
    expect(redactSecrets(`email=a%40example.com&password=${PLAIN}&title=Mr`)).toBe(
      `email=a%40example.com&password=${REDACTED}&title=Mr`,
    );
    expect(redactSecrets(`/x?access_token=${PLAIN}`)).toBe(`/x?access_token=${REDACTED}`);
    expect(redactSecrets(`{"email":"a@example.com","password":"${PLAIN}"}`)).toBe(
      `{"email":"a@example.com","password":"${REDACTED}"}`,
    );
    expect(redactSecrets(`Authorization: Bearer ${PLAIN}`)).toBe(`Authorization: ${REDACTED}`);
    expect(redactSecrets(`cookie: session=${PLAIN}; theme=dark`)).toBe(`cookie: ${REDACTED}`);
  });

  test('leaves diagnostic prose intact', () => {
    for (const prose of [
      '$.password: missing required field (expected a non-empty password)',
      'Your email or password is incorrect!',
      '2 passed: all assertions met',
    ]) {
      expect(redactSecrets(prose)).toBe(prose);
    }
  });

  test('redactValues removes exact runtime secrets', () => {
    expect(redactValues(`a ${PLAIN} b ${PLAIN}`, [PLAIN, ''])).toBe(`a ${REDACTED} b ${REDACTED}`);
  });
});

test.describe('nested context', () => {
  test('secret keys are redacted at any depth, in objects and arrays', () => {
    const context = sanitizeContext({
      Request: {
        form: { email: 'sqaf.a@example.com', password: PLAIN },
        headers: [{ Authorization: PLAIN }, { accept: 'text/html' }],
        nested: { deeper: { apiToken: PLAIN, note: `token=${PLAIN}` } },
      },
      Account: 'sqaf.a@example.com',
    });
    const text = JSON.stringify(context);
    expect(text).not.toContain(PLAIN);
    expect(context).toEqual({
      Request: {
        form: { email: 'sqaf.a@example.com', password: REDACTED },
        headers: [{ Authorization: REDACTED }, { accept: 'text/html' }],
        nested: { deeper: { apiToken: REDACTED, note: `token=${REDACTED}` } },
      },
      Account: 'sqaf.a@example.com',
    });
    expect(Object.isFrozen((context['Request'] as Record<string, unknown>)['form'])).toBe(true);
  });

  test('a nested context is rendered as JSON without secrets', () => {
    const error = new ApiError({
      operation: 'op',
      method: 'POST',
      endpoint: '/api/x',
      summary: `failed for ${SECRET}`,
      evidence: [`body password=${PLAIN}`],
    });
    expect(error.message).not.toContain(SECRET);
    expect(error.message).not.toContain(PLAIN);
    expect(error.summary).toBe(`failed for ${REDACTED}`);
    expect(error.evidence).toEqual([`body password=${REDACTED}`]);

    const infra = new InfrastructureError({
      classification: 'infrastructure/network',
      summary: 's',
      evidence: [],
      context: { Form: { user: 'u', password: PLAIN } },
    });
    expect(infra.message).toContain(`Form: {"user":"u","password":"${REDACTED}"}`);
  });

  test('cycles and excessive depth are cut, never thrown', () => {
    const cyclic: Record<string, unknown> = { password: PLAIN };
    cyclic['self'] = cyclic;
    const out = sanitizeContext({ cyclic } as never);
    expect(JSON.stringify(out)).not.toContain(PLAIN);
    expect((out['cyclic'] as Record<string, unknown>)['self']).toBe('[omitted]');
  });
});

test.describe('chained errors (cause)', () => {
  test('the cause chain is replaced by sanitized copies', () => {
    const root = new Error(`socket closed after password=${PLAIN}`);
    const middle = new TypeError(`retry with ${SECRET} failed`, { cause: root });
    const error = new InfrastructureError({ classification: 'infrastructure/network', summary: 's', evidence: [], cause: middle });

    const first = error.cause as Error;
    expect(first).not.toBe(middle);
    expect(first.name).toBe('TypeError');
    expect(first.message).toBe(`retry with ${REDACTED} failed`);
    expect(first.stack).not.toContain(SECRET);
    const second = first.cause as Error;
    expect(second.message).toBe(`socket closed after password=${REDACTED}`);
    expect(second.stack).not.toContain(PLAIN);
    // The originals are untouched.
    expect(middle.message).toContain(SECRET);
  });

  test('non-Error causes (objects, strings) are sanitized too', () => {
    const fromObject = new DataValidationError({ source: 's', issues: ['i'], cause: { request: { password: PLAIN } } });
    expect(JSON.stringify(fromObject.cause)).not.toContain(PLAIN);
    const fromString = new DataValidationError({ source: 's', issues: ['i'], cause: `token=${PLAIN}` });
    expect(fromString.cause).toBe(`token=${REDACTED}`);
  });

  test('a SqafError cause is kept (already sanitized) and a cyclic chain terminates', () => {
    const inner = new ApiError({ operation: 'op', method: 'GET', endpoint: '/e', summary: 'inner' });
    const outer = new DataValidationError({ source: 's', issues: ['i'], cause: inner });
    expect(outer.cause).toBe(inner);

    const a = new Error(`a ${PLAIN} password=${PLAIN}`);
    (a as { cause?: unknown }).cause = a;
    const copy = sanitizeCause(a) as Error;
    expect(copy.message).not.toContain(`password=${PLAIN}`);
    expect(copy.cause).toBe('[omitted]');
  });

  test('what Playwright serializes (message, stack, cause) contains no secret', () => {
    const error = new ApiError({
      operation: 'op',
      method: 'DELETE',
      endpoint: '/api/deleteAccount',
      summary: 's',
      cause: new Error(`form password=${PLAIN}`, { cause: new Error(SECRET) }),
    });
    const serialized: string[] = [];
    for (let e: unknown = error; e instanceof Error; e = (e as { cause?: unknown }).cause) {
      serialized.push(e.message, e.stack ?? '');
    }
    const text = serialized.join('\n');
    expect(text).not.toContain(PLAIN);
    expect(text).not.toContain(SECRET);
  });
});
