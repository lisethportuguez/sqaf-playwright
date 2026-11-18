import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { AllureReporter } from 'allure-playwright';
import { sqafConfig } from '../../config';
import { SQAF_ALLURE } from '../../config/allure';
import { describeLeaks, prepareAllureResults, type PrepareOutcome } from './allure/prepare-results';
import { scanPaths, type Leak } from './allure/scan-report';

/**
 * SQAF — Allure reporter (Stage 6, Phase 2). See ADR-0011.
 *
 * Thin wrapper of allure-playwright with the SQAF options, plus the safe
 * report pipeline at the end of the run. It is NOT a configured reporter: it
 * is added on the command line (`npm run test:e2e:allure`), so the baseline
 * and every existing run keep their reporters. List it AFTER the failure
 * classification reporter: Playwright runs `onEnd` in reporter order, and the
 * classification is read, never recomputed.
 *
 *  1. allure-playwright writes the raw results of THIS run (`detail: false`:
 *     only the scenario `test.step`s, never Playwright's `Fill "<value>"`
 *     action steps). The raw directory is local only and emptied at start.
 *  2. prepareAllureResults → sanitized copy in the safe directory (scanned, fail-closed).
 *  3. `allure generate` from the safe directory ONLY (allurerc.mjs), appending the history.
 *  4. The report and the history are scanned; on any finding the report is
 *     deleted and the history restored.
 *
 * It is an observer: statuses, retries and the exit code are never changed,
 * and a pipeline error is reported on the console without failing the run.
 */

export interface SqafAllureReporterOptions {
  readonly rawResultsDir?: string;
  readonly safeResultsDir?: string;
  readonly reportDir?: string;
  readonly historyFile?: string;
  readonly configFile?: string;
  readonly classificationFile?: string;
  /** Outcome of the pipeline without any value (`reports/allure-status.json`); CI fails the run when it is not safe. */
  readonly statusFile?: string;
  /** Default true. False only prepares the safe results. */
  readonly generate?: boolean;
}

interface ResolvedOptions {
  readonly rawResultsDir: string;
  readonly safeResultsDir: string;
  readonly reportDir: string;
  readonly historyFile: string;
  readonly configFile: string;
  readonly classificationFile: string;
  readonly statusFile: string;
  readonly generate: boolean;
}

export type PipelineOutcome =
  | { readonly status: 'generated'; readonly prepared: PrepareOutcome; readonly report: string; readonly historyAppended: boolean }
  | { readonly status: 'prepared'; readonly prepared: PrepareOutcome }
  | { readonly status: 'blocked-results'; readonly prepared: PrepareOutcome }
  | { readonly status: 'blocked-report'; readonly prepared: PrepareOutcome; readonly leaks: readonly Leak[] }
  | { readonly status: 'generation-failed'; readonly prepared: PrepareOutcome; readonly detail: string };

function resolveOptions(options: SqafAllureReporterOptions): ResolvedOptions {
  return {
    rawResultsDir: resolve(options.rawResultsDir ?? SQAF_ALLURE.rawResultsDir),
    safeResultsDir: resolve(options.safeResultsDir ?? SQAF_ALLURE.safeResultsDir),
    reportDir: resolve(options.reportDir ?? SQAF_ALLURE.reportDir),
    historyFile: resolve(options.historyFile ?? SQAF_ALLURE.historyFile),
    // The configuration belongs to the repository, whatever the working directory of the run.
    configFile: resolve(options.configFile ?? join(__dirname, '..', '..', SQAF_ALLURE.configFile)),
    classificationFile: resolve(options.classificationFile ?? sqafConfig.reporting.classificationOutputFile),
    statusFile: resolve(options.statusFile ?? SQAF_ALLURE.statusFile),
    generate: options.generate ?? true,
  };
}

/** Allure 3 CLI of the project (no global installation). */
function allureCli(): string {
  return join(dirname(require.resolve('allure')), '..', 'cli.js');
}

const where = (path: string): string => relative(process.cwd(), path).replaceAll('\\', '/') || '.';

/**
 * One history entry per complete run: a run of the integration tests ONLY
 * builds a report (with the existing trends) but does not append to the
 * history; the run that includes the functional scenarios appends the entry
 * of the whole run, integration results included (ADR-0011 D11). In CI the
 * integration step therefore never adds an entry and the e2e step adds one.
 */
export function appendsHistory(projects: readonly string[]): boolean {
  return projects.some((project) => project !== 'integration');
}

/** Steps 2–4 of the pipeline (exported for the unit tests: no browser, no SUT). */
export function buildSafeAllureReport(options: SqafAllureReporterOptions = {}): PipelineOutcome {
  const o = resolveOptions(options);
  const prepared = prepareAllureResults({ rawDir: o.rawResultsDir, safeDir: o.safeResultsDir, classificationFile: o.classificationFile });
  if (!prepared.written) return { status: 'blocked-results', prepared };
  if (!o.generate) return { status: 'prepared', prepared };

  mkdirSync(dirname(o.historyFile), { recursive: true });
  const backup = `${o.historyFile}.backup`;
  const hadHistory = existsSync(o.historyFile);
  if (hadHistory) copyFileSync(o.historyFile, backup);
  const restoreHistory = (): void => {
    if (hadHistory) copyFileSync(backup, o.historyFile);
    else rmSync(o.historyFile, { force: true });
  };

  const historyAppended = appendsHistory(prepared.projects);
  try {
    const run = spawnSync(
      process.execPath,
      [allureCli(), 'generate', o.safeResultsDir, '--config', o.configFile, '--output', o.reportDir, '--clean'],
      {
        encoding: 'utf8',
        timeout: 180_000,
        env: { ...process.env, SQAF_ALLURE_HISTORY_FILE: o.historyFile, SQAF_ALLURE_APPEND_HISTORY: historyAppended ? '1' : '0' },
      },
    );
    if (run.status !== 0) {
      rmSync(o.reportDir, { recursive: true, force: true });
      restoreHistory();
      return { status: 'generation-failed', prepared, detail: `allure generate exited with ${run.status ?? run.signal}` };
    }
    const leaks = scanPaths([o.reportDir, o.historyFile]);
    if (leaks.length > 0) {
      rmSync(o.reportDir, { recursive: true, force: true });
      restoreHistory();
      return { status: 'blocked-report', prepared, leaks };
    }
    return { status: 'generated', prepared, report: join(o.reportDir, 'awesome', 'index.html'), historyAppended };
  } finally {
    rmSync(backup, { force: true });
  }
}

export function describeOutcome(outcome: PipelineOutcome): string {
  const p = outcome.prepared;
  const counts = `${p.results} results, ${p.classified} failed attempts classified, ${p.attachmentsKept} screenshots kept, ${p.attachmentsDropped} attachments dropped`;
  switch (outcome.status) {
    case 'generated':
      return `[SQAF] Allure report: ${where(outcome.report)} (${counts}; history ${outcome.historyAppended ? 'entry appended' : 'not appended: integration only'}). Open it with: npm run report:allure`;
    case 'prepared':
      return `[SQAF] Allure safe results prepared (${counts}); report not generated.`;
    case 'blocked-results':
      return `[SQAF] Allure BLOCKED: the prepared results are not safe; nothing was written.\n${describeLeaks(p.leaks)}`;
    case 'blocked-report':
      return `[SQAF] Allure BLOCKED: the generated report is not safe; it was deleted and the history restored.\n${describeLeaks(outcome.leaks)}`;
    case 'generation-failed':
      return `[SQAF] Allure report not generated: ${outcome.detail}. The safe results are kept.`;
  }
}

/** Pipeline status for CI and the job summary: counts, detectors and file names only, never a value. */
export interface AllureStatus {
  readonly schemaVersion: 1;
  readonly status: PipelineOutcome['status'] | 'error';
  readonly safe: boolean;
  readonly projects: readonly string[];
  readonly results: number;
  readonly classified: number;
  readonly attachmentsKept: number;
  readonly attachmentsDropped: number;
  readonly historyAppended: boolean;
  readonly findings: readonly Leak[];
}

export function allureStatus(outcome: PipelineOutcome | undefined): AllureStatus {
  const p = outcome?.prepared;
  const findings = outcome?.status === 'blocked-report' ? outcome.leaks : outcome?.status === 'blocked-results' ? outcome.prepared.leaks : [];
  return {
    schemaVersion: 1,
    status: outcome?.status ?? 'error',
    safe: outcome?.status === 'generated' || outcome?.status === 'prepared',
    projects: p?.projects ?? [],
    results: p?.results ?? 0,
    classified: p?.classified ?? 0,
    attachmentsKept: p?.attachmentsKept ?? 0,
    attachmentsDropped: p?.attachmentsDropped ?? 0,
    historyAppended: outcome?.status === 'generated' && outcome.historyAppended,
    findings,
  };
}

export default class SqafAllureReporter extends AllureReporter {
  private readonly sqaf: ResolvedOptions;

  constructor(options: SqafAllureReporterOptions = {}) {
    const resolved = resolveOptions(options);
    // Raw results of previous runs never mix with this one.
    rmSync(resolved.rawResultsDir, { recursive: true, force: true });
    super({ resultsDir: resolved.rawResultsDir, detail: false });
    this.sqaf = resolved;
  }

  override async onEnd(): Promise<void> {
    await super.onEnd();
    let outcome: PipelineOutcome | undefined;
    try {
      outcome = buildSafeAllureReport(this.sqaf);
      console.log(describeOutcome(outcome));
    } catch (error) {
      console.error(`[SQAF] Allure pipeline error: ${error instanceof Error ? error.message : String(error)}`);
    }
    const status = allureStatus(outcome);
    mkdirSync(dirname(this.sqaf.statusFile), { recursive: true });
    writeFileSync(this.sqaf.statusFile, `${JSON.stringify(status, null, 2)}
`, 'utf8');
    const summary = process.env['GITHUB_STEP_SUMMARY'];
    if (summary) {
      const line = status.safe
        ? `Allure: ${status.status} (${status.results} results, ${status.classified} failed attempts classified, history ${status.historyAppended ? 'appended' : 'not appended'}).`
        : `Allure: **${status.status}**: nothing is published (${status.findings.map((f) => f.detector).join(', ') || 'see the log'}).`;
      appendFileSync(summary, `
> ${line}
`, 'utf8');
    }
  }
}
