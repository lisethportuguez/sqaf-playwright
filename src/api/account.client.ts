import type { APIRequestContext, APIResponse } from '@playwright/test';
import { ApiError } from '../errors/api-error';
import {
  INFRASTRUCTURE_ANTI_BOT,
  INFRASTRUCTURE_NETWORK,
  INFRASTRUCTURE_SUT_UNAVAILABLE,
} from '../errors/classifications';
import { InfrastructureError } from '../errors/infrastructure-error';
import { detectAntiBotChallenge } from '../utils/anti-bot-detector';
import { isInteger, isNonEmptyString, isRecord, type JsonRecord } from '../utils/guards';
import { htmlText, htmlTitle, normalizeText } from '../utils/text';

/**
 * SQAF — Account API client (Stage 3). See ADR-0009.
 *
 * Encapsulates the Automation Exercise account endpoints (https://automationexercise.com/api_list):
 *
 *   API 11  POST   /api/createAccount         responseCode 201 "User created!"
 *   API 14  GET    /api/getUserDetailByEmail  responseCode 200 + user | 404 "Account not found with this email..."
 *   API 12  DELETE /api/deleteAccount         responseCode 200 "Account deleted!" | 404
 *
 * Observed behaviour (2026-11-15): the HTTP status is 200 even for errors and
 * the Content-Type is text/html; the real result is the `responseCode` field
 * of the JSON body. The client therefore validates the BODY, not the status.
 *
 * Errors:
 *  - transport failure (no answer)       → InfrastructureError infrastructure/network
 *  - HTTP 5xx                            → InfrastructureError infrastructure/sut-unavailable
 *  - anti-bot challenge page instead of JSON → InfrastructureError infrastructure/anti-bot-challenge
 *  - any other unexpected answer         → ApiError api/request-failed
 *
 * Security: request parameters (password included) are never part of an
 * error, a log line or an attachment. Errors name the operation, the
 * endpoint, the HTTP status, the API's code and message and, to allow a
 * manual cleanup, the synthetic e-mail of the account.
 *
 * Uses Playwright's APIRequestContext (the `request` fixture): same base URL
 * as the browser projects, no extra dependency.
 */

/** Registration input (structural, like the Page Object inputs: `src/api` does not import `src/data`). */
export interface AccountRegistration {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly title: 'Mr' | 'Mrs';
  readonly birthDate: { readonly day: string; readonly month: string; readonly year: string };
  readonly firstName: string;
  readonly lastName: string;
  readonly company?: string;
  readonly address: string;
  readonly address2?: string;
  readonly country: string;
  readonly state: string;
  readonly city: string;
  readonly zipcode: string;
  readonly mobileNumber: string;
}

export interface AccountCredentials {
  readonly email: string;
  readonly password: string;
}

/** Subset of the user detail returned by API 14 that SQAF relies on. */
export interface AccountSummary {
  readonly id: number;
  readonly name: string;
  readonly email: string;
}

export type DeleteOutcome = 'deleted' | 'not-found';

export interface AccountApiClientOptions {
  /** Timeout of each request in ms (config: `sqafConfig.api.timeout`). */
  readonly timeout: number;
}

export const ACCOUNT_ENDPOINTS = Object.freeze({
  create: '/api/createAccount',
  detail: '/api/getUserDetailByEmail',
  delete: '/api/deleteAccount',
});

interface ApiAnswer {
  readonly httpStatus: number;
  readonly responseCode: number;
  readonly message: string | undefined;
  readonly body: JsonRecord;
}

interface Call {
  readonly operation: string;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly endpoint: string;
  readonly accountEmail: string;
  readonly form?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

function firstLine(text: string): string {
  return normalizeText(text.split('\n', 1)[0] ?? '').slice(0, 300);
}

/** Form fields of API 11, in the documented order. Optional fields are sent empty, as the SUT form does. */
export function registrationForm(account: AccountRegistration): Readonly<Record<string, string>> {
  return Object.freeze({
    name: account.name,
    email: account.email,
    password: account.password,
    title: account.title,
    birth_date: account.birthDate.day,
    birth_month: account.birthDate.month,
    birth_year: account.birthDate.year,
    firstname: account.firstName,
    lastname: account.lastName,
    company: account.company ?? '',
    address1: account.address,
    address2: account.address2 ?? '',
    country: account.country,
    zipcode: account.zipcode,
    state: account.state,
    city: account.city,
    mobile_number: account.mobileNumber,
  });
}

export class AccountApiClient {
  constructor(
    private readonly request: APIRequestContext,
    private readonly options: AccountApiClientOptions,
  ) {}

  /** Creates the account (API 11). ApiError if the SUT does not confirm the creation. */
  async createAccount(account: AccountRegistration): Promise<void> {
    const call: Call = {
      operation: 'createAccount',
      method: 'POST',
      endpoint: ACCOUNT_ENDPOINTS.create,
      accountEmail: account.email,
      form: registrationForm(account),
    };
    const answer = await this.send(call);
    if (answer.responseCode !== 201) {
      throw this.unexpected(call, answer, 'The SUT did not create the account (expected responseCode 201 "User created!").');
    }
  }

  /** Account detail (API 14), or `undefined` when the SUT answers 404 (no such account). */
  async findAccountByEmail(email: string): Promise<AccountSummary | undefined> {
    const call: Call = {
      operation: 'getUserDetailByEmail',
      method: 'GET',
      endpoint: ACCOUNT_ENDPOINTS.detail,
      accountEmail: email,
      query: { email },
    };
    const answer = await this.send(call);
    if (answer.responseCode === 404) return undefined;
    const user = answer.body['user'];
    if (
      answer.responseCode !== 200 ||
      !isRecord(user) ||
      !isInteger(user['id']) ||
      !isNonEmptyString(user['name']) ||
      user['email'] !== email
    ) {
      throw this.unexpected(call, answer, 'The SUT returned an unexpected account detail (expected responseCode 200 and the same e-mail).');
    }
    return Object.freeze({ id: user['id'], name: user['name'], email });
  }

  /**
   * Deletes the account (API 12). Idempotent: `not-found` when it did not
   * exist (already deleted), so a cleanup can always run safely.
   */
  async deleteAccount(credentials: AccountCredentials): Promise<DeleteOutcome> {
    const call: Call = {
      operation: 'deleteAccount',
      method: 'DELETE',
      endpoint: ACCOUNT_ENDPOINTS.delete,
      accountEmail: credentials.email,
      form: { email: credentials.email, password: credentials.password },
    };
    const answer = await this.send(call);
    if (answer.responseCode === 200) return 'deleted';
    if (answer.responseCode === 404) return 'not-found';
    throw this.unexpected(call, answer, 'The SUT did not delete the account (expected responseCode 200 "Account deleted!").');
  }

  private async send(call: Call): Promise<ApiAnswer> {
    let response: APIResponse;
    try {
      response = await this.request.fetch(call.endpoint, {
        method: call.method,
        ...(call.form ? { form: { ...call.form } } : {}),
        ...(call.query ? { params: { ...call.query } } : {}),
        timeout: this.options.timeout,
        failOnStatusCode: false,
      });
    } catch (error) {
      // Only the first line: Playwright's call log is never copied into the error.
      throw new InfrastructureError({
        classification: INFRASTRUCTURE_NETWORK,
        summary: `${call.operation}: the request to the SUT API failed before an answer was received.`,
        evidence: [firstLine(error instanceof Error ? error.message : String(error))],
        url: call.endpoint,
        context: { Operation: call.operation, Request: `${call.method} ${call.endpoint}`, Account: call.accountEmail },
      });
    }

    const httpStatus = response.status();
    const text = await response.text();

    if (httpStatus >= 500) {
      throw new InfrastructureError({
        classification: INFRASTRUCTURE_SUT_UNAVAILABLE,
        summary: `${call.operation}: the SUT API answered with a server error.`,
        evidence: [`HTTP ${httpStatus} ${response.statusText()}`.trim()],
        url: call.endpoint,
        context: { Operation: call.operation, Request: `${call.method} ${call.endpoint}`, Account: call.accountEmail },
      });
    }

    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      const challenge = detectAntiBotChallenge({ title: htmlTitle(text), bodyText: htmlText(text) });
      if (challenge.detected) {
        throw new InfrastructureError({
          classification: INFRASTRUCTURE_ANTI_BOT,
          summary: `${call.operation}: the SUT API answered with an anti-bot challenge page instead of JSON.`,
          evidence: challenge.matched,
          url: call.endpoint,
          context: { Operation: call.operation, 'HTTP status': httpStatus, Account: call.accountEmail },
        });
      }
      throw new ApiError({
        operation: call.operation,
        method: call.method,
        endpoint: call.endpoint,
        httpStatus,
        accountEmail: call.accountEmail,
        summary: 'The SUT API answered with a body that is not JSON.',
        evidence: [`body starts with "${firstLine(htmlTitle(text) || text).slice(0, 80)}"`],
      });
    }

    if (!isRecord(body) || !isInteger(body['responseCode'])) {
      throw new ApiError({
        operation: call.operation,
        method: call.method,
        endpoint: call.endpoint,
        httpStatus,
        accountEmail: call.accountEmail,
        summary: 'The SUT API answered with JSON without an integer "responseCode".',
      });
    }
    const message = body['message'];
    return {
      httpStatus,
      responseCode: body['responseCode'],
      message: typeof message === 'string' ? message : undefined,
      body,
    };
  }

  private unexpected(call: Call, answer: ApiAnswer, summary: string): ApiError {
    return new ApiError({
      operation: call.operation,
      method: call.method,
      endpoint: call.endpoint,
      httpStatus: answer.httpStatus,
      responseCode: answer.responseCode,
      ...(answer.message !== undefined ? { responseMessage: answer.message } : {}),
      accountEmail: call.accountEmail,
      summary,
    });
  }
}
