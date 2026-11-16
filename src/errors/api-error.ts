import { API_REQUEST_FAILED } from './classifications';
import { SqafError } from './sqaf-error';

/**
 * SQAF — Failed API request (Stage 5, used by the Stage 3 account client). See ADR-0008.
 *
 * The SUT API answered, but not as expected: an unexpected `responseCode`,
 * an unexpected message or a body that is not the documented JSON. Transport
 * failures and 5xx answers are InfrastructureError instead (network /
 * sut-unavailable), because they are not caused by the request.
 *
 * Request parameters are NEVER part of the message: only the operation, the
 * endpoint, the HTTP status and the API's own code and message.
 */

export interface ApiErrorDetails {
  /** Business operation, for example `createAccount`. */
  readonly operation: string;
  readonly method: string;
  /** Path of the endpoint, for example `/api/createAccount`. */
  readonly endpoint: string;
  readonly summary: string;
  readonly httpStatus?: number;
  /** `responseCode` field of the Automation Exercise JSON body. */
  readonly responseCode?: number;
  /** `message` field of the JSON body. */
  readonly responseMessage?: string;
  /** Test account involved, when it helps to clean it up by hand. Never a password. */
  readonly accountEmail?: string;
  readonly evidence?: readonly string[];
  readonly cause?: unknown;
}

export class ApiError extends SqafError<typeof API_REQUEST_FAILED> {
  override readonly name = 'ApiError';
  readonly operation: string;
  readonly endpoint: string;
  readonly httpStatus: number | undefined;
  readonly responseCode: number | undefined;
  readonly responseMessage: string | undefined;

  constructor(details: ApiErrorDetails) {
    super({
      classification: API_REQUEST_FAILED,
      summary: details.summary,
      context: {
        Operation: details.operation,
        Request: `${details.method} ${details.endpoint}`,
        'HTTP status': details.httpStatus,
        'Response code': details.responseCode,
        'Response message': details.responseMessage,
        Account: details.accountEmail,
      },
      ...(details.evidence ? { evidence: details.evidence } : {}),
      cause: details.cause,
    });
    this.operation = details.operation;
    this.endpoint = details.endpoint;
    this.httpStatus = details.httpStatus;
    this.responseCode = details.responseCode;
    this.responseMessage = details.responseMessage;
  }
}
