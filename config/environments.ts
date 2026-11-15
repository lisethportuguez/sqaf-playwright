/**
 * SQAF — Environment catalogue (Stage 1).
 *
 * Automation Exercise exposes a single public environment, so only
 * `production` is defined. New environments are added here and nowhere else.
 * See ADR-0005.
 */
export interface EnvironmentDefinition {
  /** Identifier used in SQAF_ENV. */
  readonly name: string;
  /** Origin of the System Under Test, without trailing slash. */
  readonly baseURL: string;
}

export const ENVIRONMENTS = {
  production: {
    name: 'production',
    baseURL: 'https://automationexercise.com',
  },
} as const satisfies Record<string, EnvironmentDefinition>;

export type EnvironmentName = keyof typeof ENVIRONMENTS;

export const DEFAULT_ENVIRONMENT: EnvironmentName = 'production';

export function isEnvironmentName(value: string): value is EnvironmentName {
  return Object.hasOwn(ENVIRONMENTS, value);
}
