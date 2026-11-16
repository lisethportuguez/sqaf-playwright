import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import {
  classifyFailure,
  emptyClassificationCounts,
  pageSnapshotSection,
  type FailureClassification,
} from '../errors/failure-classification';
import { HTTP_EVIDENCE_ATTACHMENT, parseHttpEvidence } from '../errors/http-evidence';
import { redactSecrets, redactTypedValues } from '../utils/redaction';
import { stripAnsi } from '../utils/text';

/**
 * SQAF — Failure classification reporter (Stage 1). See ADR-0006.
 *
 * Observes every failed attempt and classifies it with the SQAF taxonomy
 * (Stage 5, ADR-0008). The classification is written to the console, to a JSON
 * file and, in GitHub Actions, to the job summary.
 *
 * It is strictly an OBSERVER: it never changes a test status, the number of
 * retries or the exit code. `onEnd` returns nothing on purpose, because a
 * returned status would override the run result.
 */

export interface FailureClassificationReporterOptions {
  /** Output JSON file, relative to the working directory. */
  readonly outputFile?: string;
}

export interface ClassifiedAttempt {
  readonly test: string;
  readonly project: string;
  readonly file: string;
  readonly line: number;
  readonly retry: number;
  readonly status: TestResult['status'];
  readonly classification: FailureClassification;
  readonly evidence: readonly string[];
  readonly errorExcerpt: string;
}

export interface FailureClassificationReport {
  /** 2 since Stage 5: `byClassification` lists every classification of the taxonomy. */
  readonly schemaVersion: 2;
  readonly generatedAt: string;
  readonly runStatus: FullResult['status'];
  readonly projects: readonly string[];
  readonly note: string;
  readonly totals: {
    readonly failedAttempts: number;
    readonly byClassification: Readonly<Record<FailureClassification, number>>;
  };
  readonly failures: readonly ClassifiedAttempt[];
}

const DEFAULT_OUTPUT = 'reports/failure-classification.json';
const EXCERPT_LENGTH = 400;

/**
 * Excerpt of the first error, WITHOUT secrets (INC-2026-11-16). A failed
 * `fill(password)` prints the typed value in Playwright's call log, and this
 * JSON is published by CI: typed values, SQAF-generated passwords and
 * form/JSON/header secret pairs are redacted BEFORE truncation, so a value is
 * never kept in part. Classification uses the original text.
 */
export function redactExcerpt(message: string): string {
  return redactSecrets(redactTypedValues(message)).slice(0, EXCERPT_LENGTH);
}
const NOTE = 'Informational classification. Test statuses, retries and the exit code are not modified.';

function readErrorContext(result: TestResult): string | undefined {
  return readAttachmentText(result, 'error-context');
}

/** Text of a named attachment (inline body or file), `undefined` if absent or unreadable. */
function readAttachmentText(result: TestResult, name: string): string | undefined {
  const attachment = result.attachments.find((item) => item.name === name);
  if (!attachment) return undefined;
  if (attachment.body) return attachment.body.toString('utf8');
  if (attachment.path && existsSync(attachment.path)) {
    try {
      return readFileSync(attachment.path, 'utf8');
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function toPosix(path: string): string {
  return path.replaceAll('\\', '/');
}

export function renderStepSummary(report: FailureClassificationReport): string {
  const lines = [
    `### SQAF failure classification (${report.projects.join(', ') || 'no projects'})`,
    '',
  ];
  if (report.failures.length === 0) {
    lines.push('No failed attempts.', '');
    return lines.join('\n');
  }
  lines.push(
    '| Classification | Failed attempts |',
    '|---|---|',
    ...Object.entries(report.totals.byClassification)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => `| \`${name}\` | ${count} |`),
    '',
    '| Test | Project | Retry | Status | Classification | Evidence |',
    '|---|---|---|---|---|---|',
    ...report.failures.map(
      (failure) =>
        `| ${failure.test.replaceAll('|', '\\|')} | ${failure.project} | ${failure.retry} | ${failure.status} | \`${failure.classification}\` | ${failure.evidence.join('; ').replaceAll('|', '\\|') || '—'} |`,
    ),
    '',
    `> ${report.note}`,
    '',
  );
  return lines.join('\n');
}

export default class FailureClassificationReporter implements Reporter {
  private readonly outputFile: string;
  private rootDir = process.cwd();
  private projects: string[] = [];
  private readonly failures: ClassifiedAttempt[] = [];

  constructor(options: FailureClassificationReporterOptions = {}) {
    this.outputFile = resolve(options.outputFile ?? DEFAULT_OUTPUT);
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig): void {
    this.rootDir = config.rootDir;
    this.projects = config.projects.map((project) => project.name);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status === 'passed' || result.status === 'skipped') return;

    const messages = result.errors.map((error) => stripAnsi(error.message ?? error.value ?? ''));
    const errorContext = readErrorContext(result);
    const context = errorContext === undefined ? undefined : pageSnapshotSection(errorContext);
    // Structured HTTP status of the last main-frame document (ADR-0008 D14), when the fixtures recorded it.
    const http = parseHttpEvidence(readAttachmentText(result, HTTP_EVIDENCE_ATTACHMENT));
    const { classification, evidence } = classifyFailure({
      errorMessages: messages,
      ...(http !== undefined ? { documentResponse: http.lastDocument } : {}),
      ...(context !== undefined ? { pageSnapshot: context } : {}),
    });

    this.failures.push({
      test: test.titlePath().filter(Boolean).slice(1).join(' › '),
      project: test.parent.project()?.name ?? '',
      file: toPosix(relative(this.rootDir, test.location.file)),
      line: test.location.line,
      retry: result.retry,
      status: result.status,
      classification,
      evidence,
      errorExcerpt: redactExcerpt(messages[0] ?? ''),
    });
  }

  onEnd(result: FullResult): void {
    const byClassification = emptyClassificationCounts();
    for (const failure of this.failures) byClassification[failure.classification] += 1;

    const report: FailureClassificationReport = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      runStatus: result.status,
      projects: this.projects,
      note: NOTE,
      totals: { failedAttempts: this.failures.length, byClassification },
      failures: this.failures,
    };

    mkdirSync(dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const where = toPosix(relative(process.cwd(), this.outputFile));
    if (this.failures.length === 0) {
      console.log(`[SQAF] Failure classification: no failed attempts. Report: ${where}`);
    } else {
      const parts = Object.entries(byClassification)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${count} ${name}`);
      console.log(
        `[SQAF] Failure classification: ${this.failures.length} failed attempt(s) — ${parts.join(', ')}. Report: ${where}`,
      );
      for (const failure of this.failures) {
        if (failure.classification !== 'unclassified') {
          console.log(`[SQAF]   ${failure.classification}: ${failure.test} (retry ${failure.retry})`);
        }
      }
      console.log(`[SQAF] ${NOTE}`);
    }

    const summaryFile = process.env['GITHUB_STEP_SUMMARY'];
    if (summaryFile) appendFileSync(summaryFile, `${renderStepSummary(report)}\n`, 'utf8');
  }
}
