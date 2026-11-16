import { expect, test } from '@playwright/test';
import {
  ApiError,
  categoryOf,
  classificationMarker,
  ConfigurationError,
  DataValidationError,
  InfrastructureError,
  isSqafError,
  REDACTED,
  sanitizeContext,
  SqafError,
} from '../../../src/errors';
import { ConfigurationError as ConfigLayerConfigurationError } from '../../../config';

/** Stage 5 — error hierarchy (ADR-0008). */

test.describe('SqafError base', () => {
  test('every SQAF error is an Error and an SqafError, with category and classification', () => {
    const errors = [
      new InfrastructureError({ classification: 'infrastructure/network', summary: 'n', evidence: [] }),
      new DataValidationError({ source: 's', issues: ['i'] }),
      new ApiError({ operation: 'o', method: 'GET', endpoint: '/api/x', summary: 's' }),
    ];
    expect(errors.map((e) => [e.name, e.category, e.classification])).toEqual([
      ['InfrastructureError', 'infrastructure', 'infrastructure/network'],
      ['DataValidationError', 'test-data', 'test-data/invalid'],
      ['ApiError', 'api', 'api/request-failed'],
    ]);
    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SqafError);
      expect(isSqafError(error)).toBe(true);
      expect(error.message.startsWith(`${classificationMarker(error.classification)} `)).toBe(true);
      expect(Object.isFrozen(error.context)).toBe(true);
      expect(Object.isFrozen(error.evidence)).toBe(true);
    }
    expect(isSqafError(new Error('plain'))).toBe(false);
  });

  test('categoryOf takes the part before the slash', () => {
    expect(categoryOf('automation/locator-timeout')).toBe('automation');
    expect(categoryOf('assertion/mismatch')).toBe('assertion');
  });

  test('context values of secret-looking keys are always redacted', () => {
    expect(
      sanitizeContext({ password: 'p4ss', Password: 'x', apiToken: 't', Account: 'sqaf.a@example.com', skipped: undefined }),
    ).toEqual({ password: REDACTED, Password: REDACTED, apiToken: REDACTED, Account: 'sqaf.a@example.com' });
  });

  test('keeps the cause for debugging without copying it into the message', () => {
    const cause = new TypeError('low-level detail');
    const error = new InfrastructureError({ classification: 'infrastructure/network', summary: 's', evidence: [], cause });
    // A sanitized copy (same name and message), not the original object: see the redaction tests.
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).not.toBe(cause);
    expect((error.cause as Error).name).toBe('TypeError');
    expect((error.cause as Error).message).toBe('low-level detail');
    expect(error.message).not.toContain('low-level detail');
  });
});

test.describe('InfrastructureError keeps its Stage 1 contract', () => {
  test('exact Stage 1 message format', () => {
    const error = new InfrastructureError({
      classification: 'infrastructure/anti-bot-challenge',
      summary: 'The System Under Test answered with an anti-bot challenge page instead of the application.',
      evidence: ['title is "One moment, please..."'],
      url: 'https://automationexercise.com/',
    });
    expect(error.message).toBe(
      [
        '[SQAF:infrastructure/anti-bot-challenge] The System Under Test answered with an anti-bot challenge page instead of the application.',
        'URL: https://automationexercise.com/',
        'Evidence: title is "One moment, please..."',
        'This is an external infrastructure failure: the test is reported as FAILED and is not retried specially.',
      ].join('\n'),
    );
    expect(error.url).toBe('https://automationexercise.com/');
    expect(error.category).toBe('infrastructure');
  });
});

test.describe('DataValidationError', () => {
  test('lists the source and every issue', () => {
    const error = new DataValidationError({ source: 'users/invalid-credentials.json', issues: ['$[0].email: a', '$[1].id: b'] });
    expect(error.source).toBe('users/invalid-credentials.json');
    expect(error.issues).toEqual(['$[0].email: a', '$[1].id: b']);
    expect(error.message).toBe(
      [
        '[SQAF:test-data/invalid] Invalid test data (2 issues).',
        'Source: users/invalid-credentials.json',
        'Evidence: $[0].email: a',
        'Evidence: $[1].id: b',
      ].join('\n'),
    );
  });
});

test.describe('ApiError', () => {
  test('describes the request and the answer, never the parameters', () => {
    const error = new ApiError({
      operation: 'createAccount',
      method: 'POST',
      endpoint: '/api/createAccount',
      httpStatus: 200,
      responseCode: 400,
      responseMessage: 'Email already exists!',
      accountEmail: 'sqaf.user-x-1@example.com',
      summary: 'The SUT did not create the account.',
    });
    expect(error.message).toBe(
      [
        '[SQAF:api/request-failed] The SUT did not create the account.',
        'Operation: createAccount',
        'Request: POST /api/createAccount',
        'HTTP status: 200',
        'Response code: 400',
        'Response message: Email already exists!',
        'Account: sqaf.user-x-1@example.com',
      ].join('\n'),
    );
    expect([error.operation, error.endpoint, error.httpStatus, error.responseCode]).toEqual([
      'createAccount',
      '/api/createAccount',
      200,
      400,
    ]);
  });
});

test('ConfigurationError is the Stage 1 class, re-exported by the Error Handling layer', () => {
  expect(ConfigurationError).toBe(ConfigLayerConfigurationError);
  const error = new ConfigurationError('SQAF_ENV="x" is not defined.');
  expect(error.name).toBe('ConfigurationError');
  expect(error).toBeInstanceOf(Error);
});
