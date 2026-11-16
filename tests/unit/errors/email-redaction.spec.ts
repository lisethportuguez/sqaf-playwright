import { expect, test } from '@playwright/test';
import { ApiError, classifyFailure, DataValidationError, InfrastructureError } from '../../../src/errors';
import { evidenceUrl } from '../../../src/errors/http-evidence';
import { redactTestErrors } from '../../../src/fixtures/data.fixture';
import { redactExcerpt } from '../../../src/reporting/failure-classification-reporter';
import { generatedPassword, redactCardNumbers, redactEmails, redactSecrets, uniqueEmail } from '../../../src/utils';

/**
 * Stage 4 (E4.5) — synthetic e-mails never reach an error message, its JSON
 * serialization, the cause chain, the reporter excerpt or the job summary.
 * Nothing of the address is kept, not even the data id of a SQAF address
 * (E4.5 final security closure: the address can be rebuilt from it). The
 * reporter output and the job summary are covered end to end by
 * tests/unit/reporting/run-summary-reporter.spec.ts.
 *
 * Every value below is fictitious and built at runtime.
 */
const DATA_ID = 'user-e2e5unit-0a1b2c3d-1';
const EMAIL = uniqueEmail(DATA_ID);
const OTHER = ['someone', '@', 'example', '.org'].join('');
const SECRET = generatedPassword();

/** Everything Playwright serializes from a thrown error: message, stack and the cause chain. */
function serialized(error: unknown): string {
  const parts: string[] = [JSON.stringify(error)];
  for (let e: unknown = error; e instanceof Error; e = (e as { cause?: unknown }).cause) parts.push(e.message, e.stack ?? '');
  return parts.join('\n');
}

test.describe('redactEmails', () => {
  test('every address, SQAF or not, is fully redacted: no data id remains', () => {
    expect(EMAIL).toBe(`sqaf.${DATA_ID}@example.com`);
    expect(redactEmails(`account ${EMAIL} and ${OTHER}`)).toBe('account [e-mail redacted] and [e-mail redacted]');
    expect(redactEmails(EMAIL)).not.toContain(DATA_ID);
  });

  test('URL-encoded addresses (form bodies, query strings) are redacted too', () => {
    expect(redactEmails(`email=${encodeURIComponent(EMAIL)}&x=1`)).toBe(`email=[e-mail redacted]&x=1`);
    expect(redactEmails(`?email=${encodeURIComponent(OTHER)}`)).toBe('?email=[e-mail redacted]');
  });

  test('leaves text that is not an address intact (tags, versions, prose)', () => {
    for (const text of [
      '@smoke @regression',
      'Playwright 1.65.0',
      '> sqaf-playwright@0.1.0 test:e2e',
      '@playwright/test@1.65.0',
      'a @ b',
      'Logged in as SQAF Tester',
      'HTTP 503 Service Unavailable',
    ]) {
      expect(redactEmails(text)).toBe(text);
    }
  });

  test('redactSecrets includes it, so every existing redaction point covers e-mails', () => {
    // Regression (E4.5): a generated password inside a form pair is redacted once, without a stray bracket.
    expect(redactSecrets(`password=${SECRET}&x=1`)).toBe('password=[REDACTED]&x=1');
    expect(redactSecrets(`password=${SECRET} for ${EMAIL}`)).toBe(`password=[REDACTED] for [e-mail redacted]`);
  });
});

test.describe('SQAF errors', () => {
  test('ApiError: neither the message nor its JSON contain the e-mail or its data id', () => {
    const error = new ApiError({
      operation: 'testUser cleanup',
      method: 'GET',
      endpoint: '/api/getUserDetailByEmail',
      accountEmail: EMAIL,
      responseMessage: `User ${EMAIL} still exists`,
      summary: `The test account ${EMAIL} still exists after its deletion: delete it by hand.`,
      evidence: [`GET /api/getUserDetailByEmail?email=${encodeURIComponent(EMAIL)}`],
    });
    expect(error.message).toContain(`Account: [e-mail redacted]`);
    expect(error.message).toContain('Request: GET /api/getUserDetailByEmail');
    const text = serialized(error);
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(encodeURIComponent(EMAIL));
    expect(text).not.toContain('@example.com');
    expect(text).not.toContain(DATA_ID);
    // Diagnostic fields are untouched.
    expect(error.responseMessage).toBe(`User [e-mail redacted] still exists`);
    expect([error.operation, error.endpoint, error.classification]).toEqual(['testUser cleanup', '/api/getUserDetailByEmail', 'api/request-failed']);
  });

  test('nested context and chained causes are redacted at every level', () => {
    const root = new Error(`connect failed for ${EMAIL}`);
    const middle = new TypeError(`retry for ${OTHER}`, { cause: root });
    const error = new InfrastructureError({
      classification: 'infrastructure/sut-unavailable',
      summary: 'createAccount: the SUT API answered with a server error.',
      evidence: ['HTTP 503 Service Unavailable'],
      context: { Account: EMAIL, Request: { form: { email: EMAIL }, list: [OTHER] } },
      cause: middle,
    });
    const text = serialized(error);
    expect(text).not.toContain('@example.');
    expect(text).not.toContain(DATA_ID);
    expect(text).toContain('[e-mail redacted]');
    expect((error.cause as Error).message).toBe('retry for [e-mail redacted]');
    expect(((error.cause as Error).cause as Error).message).toBe(`connect failed for [e-mail redacted]`);
    // The status evidence and the classification are unchanged.
    expect(error.evidence).toEqual(['HTTP 503 Service Unavailable']);
    expect(error.classification).toBe('infrastructure/sut-unavailable');
  });

  test('a non-Error cause and a data validation error are redacted too', () => {
    const fromObject = new DataValidationError({ source: 's', issues: [`$.email: ${EMAIL} is taken`], cause: { email: EMAIL } });
    expect(serialized(fromObject)).not.toContain(EMAIL);
    expect(serialized(fromObject)).not.toContain(DATA_ID);
    expect(fromObject.issues).toEqual([`$.email: [e-mail redacted] is taken`]);
    expect(fromObject.message).toContain(`[e-mail redacted] is taken`);
  });
});

test.describe('test errors, reporter excerpt, classification and HTTP evidence', () => {
  test('the credential guard redaction of test errors removes e-mails (console of credential suites)', () => {
    const errors = [{ message: `Timed out filling ${EMAIL}`, stack: `Error: ${EMAIL}\n at x`, cause: { message: OTHER } }];
    redactTestErrors(errors, [SECRET]);
    expect(JSON.stringify(errors)).not.toContain('@example.');
    expect(JSON.stringify(errors)).not.toContain(DATA_ID);
    expect(errors[0]!.message).toBe(`Timed out filling [e-mail redacted]`);
  });

  test('the classification report excerpt is redacted', () => {
    expect(redactExcerpt(`- fill("${EMAIL}")\nAccount: ${EMAIL}`)).not.toContain('@example.com');
    expect(redactExcerpt(`Account: ${EMAIL}`)).toBe('Account: [e-mail redacted]');
  });

  test('the classification does not change: it reads the raw message, never the redacted one', () => {
    const message = `[SQAF:infrastructure/sut-unavailable] createAccount failed for ${EMAIL}`;
    expect(classifyFailure({ errorMessages: [message] })).toEqual(classifyFailure({ errorMessages: [redactSecrets(message)] }));
    expect(classifyFailure({ errorMessages: ['x'], documentResponse: { status: 503, statusText: 'Service Unavailable', method: 'POST' } })).toEqual({
      classification: 'infrastructure/sut-unavailable',
      evidence: ['main document (POST) answered HTTP 503 Service Unavailable'],
    });
  });

  test('HTTP evidence URLs keep only origin and path (no query, so no e-mail)', () => {
    expect(evidenceUrl(`https://automationexercise.com/api/getUserDetailByEmail?email=${encodeURIComponent(EMAIL)}`)).toBe(
      'https://automationexercise.com/api/getUserDetailByEmail',
    );
  });
});

test.describe('redactCardNumbers (E4.5 final closure)', () => {
  // Built at runtime: public test card numbers, never real ones.
  const VISA = ['4111', '1111', '1111', '1111'].join('');
  const AMEX = ['3782', '822463', '10005'].join('');

  test('Luhn-valid card numbers (15 to 19 digits) are redacted, also through redactSecrets', () => {
    expect(redactCardNumbers(`card ${VISA} and ${AMEX}.`)).toBe('card [card redacted] and [card redacted].');
    expect(redactSecrets(`{"card": "${VISA}"}`)).toBe('{"card": "[card redacted]"}');
  });

  test('timestamps, ids and non-Luhn digit runs are left intact', () => {
    for (const text of ['at 1763337600000 ms', 'run 19431234567', '4111111111111112', 'v1.65.0', 'HTTP 503']) {
      expect(redactCardNumbers(text)).toBe(text);
    }
  });
});
