import { TEST_DATA_INVALID } from './classifications';
import { SqafError } from './sqaf-error';

/**
 * SQAF — Invalid test data (Stage 5, used by the Stage 3 data layer). See ADR-0008.
 *
 * Raised when a dataset or a generated object does not match its expected
 * structure: missing file, invalid JSON, wrong type, unknown field, duplicated
 * id, unknown case id or an invalid factory override. It reports EVERY issue
 * found, each one with its JSON path.
 */

export interface DataValidationErrorDetails {
  /** Dataset file or factory that produced the data, for example `users/invalid-credentials.json`. */
  readonly source: string;
  /** One entry per problem, for example `$[1].email: expected a non-empty string`. */
  readonly issues: readonly string[];
  readonly summary?: string;
  readonly cause?: unknown;
}

export class DataValidationError extends SqafError<typeof TEST_DATA_INVALID> {
  override readonly name = 'DataValidationError';
  readonly source: string;
  readonly issues: readonly string[];

  constructor(details: DataValidationErrorDetails) {
    const count = details.issues.length;
    super({
      classification: TEST_DATA_INVALID,
      summary: details.summary ?? `Invalid test data (${count} issue${count === 1 ? '' : 's'}).`,
      context: { Source: details.source },
      evidence: details.issues,
      cause: details.cause,
    });
    this.source = details.source;
    this.issues = this.evidence;
  }
}
