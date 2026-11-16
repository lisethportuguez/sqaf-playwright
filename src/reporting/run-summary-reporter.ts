import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { FullConfig, FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { sqafConfig } from '../../config';
import type { FailureClassification } from '../errors/failure-classification';
import { redactSecrets } from '../utils/redaction';

/**
 * SQAF — Safe run summary (Stage 4, E4.5). See ADR-0003 and ADR-0010.
 *
 * Observer-only reporter for the CI runs of the functional scenarios and,
 * since the E4.5 security closure, of the integration tests. It writes the
 * ONLY result of those runs that CI publishes: per test, its outcome,
 * attempts, durations and the classification of each failed attempt, plus
 * the run totals; and the same as a table in the GitHub job summary.
 *
 * What it never writes: error messages or excerpts, step titles, attachments,
 * e-mails, account data ids, passwords or card data. Titles come from the
 * test files and are still redacted (secret pairs, generated passwords and
 * any e-mail, which becomes `[e-mail redacted]` with no account data id).
 *
 * The classification of failed attempts is READ from the failure
 * classification report, written by the classification reporter, which must
 * be listed BEFORE this one (Playwright runs `onEnd` in reporter order). It is
 * never recomputed here. Statuses, retries and the exit code are not modified.
 */

export interface RunSummaryReporterOptions {
  /** Default `reports/run-summary.json`. */
  readonly outputFile?: string;
  /** Default: the classification report of the Configuration layer. */
  readonly classificationFile?: string;
}

export interface SummaryAttempt {
  readonly retry: number;
  readonly status: TestResult['status'];
  readonly durationMs: number;
  /** Only for failed attempts; `null` when the classification report has no entry. */
  readonly classification?: FailureClassification | null;
  readonly evidence?: readonly string[];
}

export interface SummaryTest {
  readonly title: string;
  readonly tags: readonly string[];
  readonly outcome: ReturnType<TestCase['outcome']>;
  readonly attempts: readonly SummaryAttempt[];
}

export interface RunSummary {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly runStatus: FullResult['status'];
  readonly durationMs: number;
  readonly projects: readonly string[];
  /** The --grep of the run, or `all` (for example `@smoke` on pull requests). */
  readonly selection: string;
  readonly workers: number;
  readonly retries: readonly number[];
  readonly totals: {
    readonly tests: number;
    readonly expected: number;
    readonly unexpected: number;
    readonly flaky: number;
    readonly skipped: number;
    readonly failedAttempts: number;
    readonly byClassification: Readonly<Record<string, number>>;
  };
  readonly tests: readonly SummaryTest[];
  readonly note: string;
}

const DEFAULT_OUTPUT = 'reports/run-summary.json';
const NOTE =
  'Safe summary: no error messages, step titles, attachments, e-mails, account ids, passwords or card data. Failed attempts keep their classification; flaky tests are reported, never hidden.';

/**
 * Removes secrets and any e-mail address from a text (`redactSecrets` covers
 * both, and since the E4.5 final closure it keeps no account data id).
 */
export function sanitizeSummaryText(text: string): string {
  return redactSecrets(text);
}

/** Heading of the job summary: the integration tests or the functional scenarios. */
export function summaryHeading(projects: readonly string[]): string {
  const integrationOnly = projects.length > 0 && projects.every((project) => project === 'integration');
  return integrationOnly ? 'SQAF integration tests' : 'SQAF functional scenarios';
}

/**
 * Tags as SQAF writes them (`@regression`, `@smoke`, `@account`), once each.
 * Playwright also turns any `@word` of a title into a tag (for example the
 * domain of an e-mail): those are dropped.
 */
export function catalogTags(tags: readonly string[]): readonly string[] {
  return [...new Set(tags.filter((tag) => /^@[a-z0-9-]+$/.test(tag)))];
}

/**
 * The `--grep` of the run, read from the runner's command line (reporters run
 * in the runner process). Playwright does not expose the CLI grep in
 * `FullConfig`. Returns `undefined` when there is none.
 */
export function cliGrep(argv: readonly string[]): string | undefined {
  for (const [index, arg] of argv.entries()) {
    if (arg.startsWith('--grep=')) return arg.slice('--grep='.length);
    if (arg === '--grep' || arg === '-g') return argv[index + 1];
  }
  return undefined;
}

/** Same title as the failure classification report: path without the project, ` › ` separated. */
function titleOf(test: TestCase): string {
  return test.titlePath().filter(Boolean).slice(1).join(' › ');
}

/** Same file path in the summary on every OS. */
const posix = (text: string): string => text.replaceAll('\\', '/');

interface ClassifiedEntry {
  readonly test: string;
  readonly retry: number;
  readonly classification: FailureClassification;
  readonly evidence: readonly string[];
}

function readClassifications(file: string): readonly ClassifiedEntry[] {
  if (!existsSync(file)) return [];
  try {
    const report = JSON.parse(readFileSync(file, 'utf8')) as { failures?: ClassifiedEntry[] };
    return report.failures ?? [];
  } catch {
    return [];
  }
}

const escapeCell = (text: string): string => text.replaceAll('|', '\\|');

export function renderRunSummary(summary: RunSummary): string {
  const t = summary.totals;
  const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
  const lines = [
    `### ${summaryHeading(summary.projects)} (${summary.projects.join(', ')}; selection: ${summary.selection})`,
    '',
    '| Tests | Passed | Failed | Flaky | Skipped | Failed attempts | Duration |',
    '|---|---|---|---|---|---|---|',
    `| ${t.tests} | ${t.expected} | ${t.unexpected} | ${t.flaky} | ${t.skipped} | ${t.failedAttempts} | ${seconds(summary.durationMs)} |`,
    '',
  ];
  const classified = Object.entries(t.byClassification).filter(([, n]) => n > 0);
  if (classified.length > 0) {
    lines.push('| Classification | Failed attempts |', '|---|---|', ...classified.map(([name, n]) => `| \`${name}\` | ${n} |`), '');
  }
  lines.push(
    '| Test | Outcome | Attempts | Duration (last) | Failed attempts |',
    '|---|---|---|---|---|',
    ...summary.tests.map((test) => {
      const last = test.attempts[test.attempts.length - 1];
      const failed = test.attempts
        .filter((a) => a.status !== 'passed' && a.status !== 'skipped')
        .map((a) => `retry ${a.retry}: \`${a.classification ?? 'not classified'}\``)
        .join('; ');
      return `| ${escapeCell(test.title)} | ${test.outcome} | ${test.attempts.length} | ${last ? seconds(last.durationMs) : '—'} | ${failed || '—'} |`;
    }),
    '',
    `> ${summary.note}`,
    '',
  );
  return lines.join('\n');
}

export default class RunSummaryReporter implements Reporter {
  private readonly outputFile: string;
  private readonly classificationFile: string;
  private config: FullConfig | undefined;
  private readonly tests = new Map<TestCase, SummaryAttempt[]>();

  constructor(options: RunSummaryReporterOptions = {}) {
    this.outputFile = resolve(options.outputFile ?? DEFAULT_OUTPUT);
    this.classificationFile = resolve(options.classificationFile ?? sqafConfig.reporting.classificationOutputFile);
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    this.config = config;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const attempts = this.tests.get(test) ?? [];
    attempts.push({ retry: result.retry, status: result.status, durationMs: result.duration });
    this.tests.set(test, attempts);
  }

  onEnd(result: FullResult): void {
    const classified = readClassifications(this.classificationFile);
    const byClassification: Record<string, number> = {};
    const tests: SummaryTest[] = [];
    for (const [test, attempts] of this.tests) {
      const title = titleOf(test);
      const withClassification = attempts.map((attempt) => {
        if (attempt.status === 'passed' || attempt.status === 'skipped') return attempt;
        const entry = classified.find((c) => c.test === title && c.retry === attempt.retry);
        const classification = entry?.classification ?? null;
        byClassification[classification ?? 'not classified'] = (byClassification[classification ?? 'not classified'] ?? 0) + 1;
        return { ...attempt, classification, evidence: (entry?.evidence ?? []).map(sanitizeSummaryText) };
      });
      tests.push({ title: sanitizeSummaryText(posix(title)), tags: catalogTags(test.tags), outcome: test.outcome(), attempts: withClassification });
    }
    const count = (outcome: SummaryTest['outcome']): number => tests.filter((t) => t.outcome === outcome).length;
    const selection = sanitizeSummaryText(cliGrep(process.argv) ?? 'all');

    const ran = [...new Set([...this.tests.keys()].map((t) => t.parent.project()?.name ?? ''))];
    const summary: RunSummary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runStatus: result.status,
      durationMs: Math.round(result.duration),
      projects: ran,
      selection,
      workers: this.config?.workers ?? 0,
      retries: [...new Set(this.config?.projects.filter((p) => ran.includes(p.name)).map((p) => p.retries) ?? [])],
      totals: {
        tests: tests.length,
        expected: count('expected'),
        unexpected: count('unexpected'),
        flaky: count('flaky'),
        skipped: count('skipped'),
        failedAttempts: Object.values(byClassification).reduce((a, b) => a + b, 0),
        byClassification,
      },
      tests,
      note: NOTE,
    };

    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
    if (summaryFile) appendFileSync(summaryFile, `${renderRunSummary(summary)}\n`, 'utf8');
  }
}
