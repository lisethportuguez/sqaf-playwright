/**
 * SQAF — Configuration layer entry point (Stage 1).
 *
 * Single import for every configuration value. Resolved once, validated and
 * frozen. See docs/architecture/architecture.md and ADR-0005.
 */
import { CREDENTIAL_EVIDENCE } from './credential-evidence';
import { BASELINE_EVIDENCE, sqafEvidencePolicy, type EvidencePolicy } from './evidence';
import { loadEnvFileIfPresent, resolveEnvironment, type ResolvedEnvironment } from './environment';
import { ENVIRONMENTS } from './environments';
import { SQAF_LOCATORS, type LocatorPolicy } from './locators';
import { SQAF_TEST_DATA, type TestDataPolicy } from './test-data';
import { BASELINE_TIMEOUTS, SQAF_API_TIMEOUT, SQAF_TIMEOUTS, type TimeoutPolicy } from './timeouts';

export interface BaselineConditions {
  /** Always the production SUT: SQAF_ENV and SQAF_BASE_URL never apply. */
  readonly baseURL: string;
  readonly retries: 0;
  readonly workers: 1;
  readonly timeouts: TimeoutPolicy;
  readonly evidence: EvidencePolicy;
}

export interface SqafConfig {
  readonly environment: ResolvedEnvironment;
  readonly isCI: boolean;
  readonly timeouts: TimeoutPolicy;
  readonly evidence: EvidencePolicy;
  /** Evidence of the tests that handle account credentials (Stage 3, ADR-0009 D16). The general policy above does not change. */
  readonly credentialEvidence: EvidencePolicy;
  /** Locator policy of the SQAF projects (Stage 2, ADR-0007). Never applied to the baseline. */
  readonly locators: LocatorPolicy;
  /** Frozen Stage 0 conditions of the experimental baseline. */
  readonly baseline: BaselineConditions;
  readonly reporting: {
    readonly classificationOutputFile: string;
  };
  /** SUT API used for test-data provisioning (Stage 3, ADR-0009). Never used by the baseline. */
  readonly api: {
    readonly timeout: number;
  };
  /** Location of the static datasets (Stage 3, ADR-0009). */
  readonly testData: TestDataPolicy;
}

export function buildSqafConfig(environment: ResolvedEnvironment): SqafConfig {
  return Object.freeze({
    environment,
    isCI: environment.isCI,
    timeouts: SQAF_TIMEOUTS,
    evidence: sqafEvidencePolicy(environment.isCI),
    credentialEvidence: CREDENTIAL_EVIDENCE,
    locators: SQAF_LOCATORS,
    baseline: Object.freeze({
      baseURL: ENVIRONMENTS.production.baseURL,
      retries: 0,
      workers: 1,
      timeouts: BASELINE_TIMEOUTS,
      evidence: BASELINE_EVIDENCE,
    }),
    reporting: Object.freeze({
      classificationOutputFile: 'reports/failure-classification.json',
    }),
    api: Object.freeze({ timeout: SQAF_API_TIMEOUT }),
    testData: SQAF_TEST_DATA,
  });
}

loadEnvFileIfPresent();

export const sqafConfig: SqafConfig = buildSqafConfig(resolveEnvironment());

export { ConfigurationError } from './environment';
export { SQAF_ALLURE, type AllurePolicy } from './allure';
export { CREDENTIAL_EVIDENCE, credentialEvidenceViolations, type EffectiveEvidence } from './credential-evidence';
export type { EvidencePolicy } from './evidence';
export type { LocatorPolicy } from './locators';
export type { TestDataPolicy } from './test-data';
export type { TimeoutPolicy } from './timeouts';
