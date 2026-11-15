import { existsSync } from 'node:fs';
import {
  DEFAULT_ENVIRONMENT,
  ENVIRONMENTS,
  isEnvironmentName,
  type EnvironmentName,
} from './environments';

/**
 * SQAF — Environment resolution (Stage 1).
 *
 * Reads and validates the SQAF_* variables. Invalid values fail fast, before
 * any test runs, with a message that names the variable and the allowed
 * values. See ADR-0005 and `.env.example`.
 */

/** Raised when the configuration is invalid. Never caught by the framework. */
export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

export interface ResolvedEnvironment {
  readonly name: EnvironmentName;
  /** Effective base URL for SQAF suites (environment default or override). */
  readonly baseURL: string;
  /** True when SQAF_BASE_URL overrode the environment default. */
  readonly baseURLOverridden: boolean;
  /** Same semantics as Stage 0: any non-empty CI variable means CI. */
  readonly isCI: boolean;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Loads `.env` into process.env if the file exists. Variables already present
 * in the environment are NOT overwritten (Node.js process.loadEnvFile
 * semantics), so CI and shell values always win.
 */
export function loadEnvFileIfPresent(path = '.env'): boolean {
  if (!existsSync(path)) return false;
  process.loadEnvFile(path);
  return true;
}

function readOptional(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function parseBaseURL(raw: string, variable = 'SQAF_BASE_URL'): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigurationError(`${variable} must be an absolute URL, received "${raw}".`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigurationError(`${variable} must use http or https, received "${url.protocol}".`);
  }
  if (url.username || url.password) {
    throw new ConfigurationError(`${variable} must not contain credentials.`);
  }
  if (url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new ConfigurationError(
      `${variable} must be an origin without path, query or fragment, received "${raw}".`,
    );
  }
  return url.origin;
}

/** Pure: resolves the environment from the given variables (process.env by default). */
export function resolveEnvironment(env: Env = process.env): ResolvedEnvironment {
  const requested = readOptional(env, 'SQAF_ENV') ?? DEFAULT_ENVIRONMENT;
  if (!isEnvironmentName(requested)) {
    const allowed = Object.keys(ENVIRONMENTS).join(', ');
    throw new ConfigurationError(`SQAF_ENV="${requested}" is not defined. Allowed values: ${allowed}.`);
  }

  const override = readOptional(env, 'SQAF_BASE_URL');
  return {
    name: requested,
    baseURL: override ? parseBaseURL(override) : ENVIRONMENTS[requested].baseURL,
    baseURLOverridden: override !== undefined,
    isCI: Boolean(env['CI']),
  };
}
