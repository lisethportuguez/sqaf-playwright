import { randomBytes } from 'node:crypto';
import { GENERATED_PASSWORD_PREFIX } from './redaction';

/**
 * SQAF — Unique identifiers (Stage 5). See ADR-0009 (reproducible test data).
 *
 * An id is `<prefix>-<runToken>-<sequence>`:
 *  - `runToken` identifies one execution of one worker. It is the ONLY source
 *    of randomness (timestamp + 4 random bytes) and is created once, so two
 *    runs, or two parallel workers, never produce the same id.
 *  - `sequence` is a counter, so ids are deterministic for a given token:
 *    `createIdSource('k3x9-ab12cd34')` always yields the same ids in the same
 *    order. Tests pass a fixed token to get fully reproducible data.
 *
 * Ids contain only `[a-z0-9-]`, so they are valid in e-mail local parts.
 */

export interface IdSource {
  /** Token shared by every id of this source. */
  readonly runToken: string;
  next(prefix?: string): string;
}

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PREFIX = /^[a-z][a-z0-9]*$/;

export function createRunToken(now: Date = new Date(), entropy: Buffer = randomBytes(4)): string {
  return `${now.getTime().toString(36)}-${entropy.toString('hex')}`;
}

export function createIdSource(runToken: string = createRunToken()): IdSource {
  if (!TOKEN.test(runToken)) throw new RangeError(`Invalid run token "${runToken}": use [a-z0-9] groups joined by "-".`);
  let sequence = 0;
  return Object.freeze({
    runToken,
    next(prefix = 'sqaf'): string {
      if (!PREFIX.test(prefix)) throw new RangeError(`Invalid id prefix "${prefix}": use a lowercase letter then [a-z0-9].`);
      sequence += 1;
      return `${prefix}-${runToken}-${sequence}`;
    },
  });
}

/** Process-wide source: one token per worker process. */
const defaultSource = createIdSource();

/** Next unique id of this worker, for example `user-m3k2x1-9f8e7d6c-1`. */
export function uniqueId(prefix = 'sqaf', source: IdSource = defaultSource): string {
  return source.next(prefix);
}

/**
 * Synthetic e-mail address for an id. Uses the reserved `example.com` domain
 * (RFC 2606), so it can never belong to a real person.
 */
export function uniqueEmail(id: string = uniqueId('user'), domain = 'example.com'): string {
  if (!TOKEN.test(id)) throw new RangeError(`Invalid id "${id}" for an e-mail address.`);
  return `sqaf.${id}@${domain}`;
}

/** Random secret (base64url) for passwords. Never derived from an id and never logged. */
export function randomSecret(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Password of a synthetic account: `Sqaf#` + 16 random base64url characters.
 * The fixed format lets the redaction helpers recognise it (`redactSecrets`).
 */
export function generatedPassword(): string {
  return `${GENERATED_PASSWORD_PREFIX}${randomSecret(12)}`;
}
