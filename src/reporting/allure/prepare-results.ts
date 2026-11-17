import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { SQAF_ALLURE } from '../../../config/allure';
import { redactSecrets, redactTypedValues } from '../../utils/redaction';
import { describeLeaks, scanPaths, type Leak } from './scan-report';

/**
 * SQAF — Allure results preparation (Stage 6, Phase 2). See ADR-0011.
 *
 * Builds the ONLY input of the Allure report: a sanitized copy of the raw
 * results of one run. Nothing is copied by default (allowlists):
 *
 *  - Every text (titles, full names, steps, messages, stack traces,
 *    parameters, labels, links, descriptions) goes through the SQAF redaction
 *    (typed values, secret pairs, generated passwords, e-mails, cards) plus
 *    account data ids, local paths and the machine name.
 *  - Annotations that Allure turns into pseudo-steps are dropped, except the
 *    two traceability ones of the catalog (ADR-0010 D4), which become a link
 *    and a label. `sqaf-test-data` (account data id) never reaches the report.
 *  - Labels: only an allowlist; `host`, `thread`, `package`, `titlePath` and
 *    any unknown label are dropped. Grouping labels are rebuilt:
 *    suite (E2E / Integration / Unit) → module → scenario.
 *  - Attachments: only failure screenshots of the suites in
 *    `SQAF_ALLURE.screenshotSuites`. Traces, videos, error contexts, console
 *    output, account cleanup and HTTP evidence records are always dropped.
 *  - Containers, executor and category files of the raw directory are not
 *    copied; `environment.properties` is written by SQAF.
 *
 * The SQAF failure classification is READ (never recomputed or modified) from
 * the classification report and added as the `sqaf.classification` label of
 * each failed attempt, exactly like the run summary does.
 *
 * Fail-closed: the prepared files are scanned in a staging directory and are
 * moved into the safe directory only if the scan finds nothing.
 */

export const CLASSIFICATION_LABEL = 'sqaf.classification';
export const NOT_CLASSIFIED = 'not classified';
export const REDACTED_DATA_ID = '[data id redacted]';
export const REDACTED_HOST = '[host redacted]';

/** A SQAF data id (`user-<run token>-<n>`, run token `<base36 time>-<8 hex>`), with or without its prefix. */
const DATA_ID = /(?:\b[a-z][a-z0-9]{0,15}-)?\b[a-z0-9]{6,12}-[0-9a-f]{8}-\d{1,6}\b/g;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface SanitizeContext {
  /** Repository root: absolute paths under it become relative (`<root>`). */
  readonly rootDir: string;
  readonly homeDir: string;
  readonly host: string;
}

export function defaultSanitizeContext(rootDir: string = process.cwd()): SanitizeContext {
  return { rootDir: resolve(rootDir), homeDir: homedir(), host: hostname() };
}

/** Both separators of a Windows or POSIX path, case-insensitive on Windows. */
function pathPattern(path: string): RegExp {
  const parts = path.split(/[\\/]+/).filter(Boolean).map(escapeRegExp);
  const lead = path.startsWith('/') ? '/' : '';
  return new RegExp(lead + parts.join('[\\\\/]{1,2}'), 'gi');
}

/** Removes every value that could identify a person, an account or a machine. */
export function sanitizeText(text: string, context: SanitizeContext = defaultSanitizeContext()): string {
  let out = redactSecrets(redactTypedValues(text));
  out = out.replace(DATA_ID, REDACTED_DATA_ID);
  if (context.rootDir.length > 3) out = out.replace(pathPattern(context.rootDir), '<root>');
  if (context.homeDir.length > 3) out = out.replace(pathPattern(context.homeDir), '~');
  out = out
    .replace(/\b([A-Za-z]:[\\/]{1,2}Users[\\/]{1,2})[^\\/\s"']{1,64}/g, '$1[user]')
    .replace(/\/(home|Users)\/[A-Za-z0-9._-]{1,64}\//g, '/$1/[user]/');
  if (context.host.length >= 4) out = out.replace(new RegExp(escapeRegExp(context.host), 'gi'), REDACTED_HOST);
  return out;
}

// ---------------------------------------------------------------------------
// Allure result model (only the fields SQAF keeps)
// ---------------------------------------------------------------------------

export interface AllureLabel {
  name: string;
  value: string;
}
export interface AllureLink {
  name?: string;
  url: string;
  type?: string;
}
export interface AllureParameter {
  name: string;
  value: string;
  excluded?: boolean;
  mode?: string;
}
export interface AllureAttachment {
  name: string;
  source: string;
  type: string;
}
export interface AllureStatusDetails {
  message?: string;
  trace?: string;
  known?: boolean;
  muted?: boolean;
  flaky?: boolean;
}
export interface AllureStep {
  name?: string;
  status?: string;
  stage?: string;
  start?: number;
  stop?: number;
  statusDetails?: AllureStatusDetails;
  steps?: AllureStep[];
  attachments?: AllureAttachment[];
  parameters?: AllureParameter[];
}
export interface AllureResult extends AllureStep {
  uuid: string;
  historyId?: string;
  testCaseId?: string;
  fullName?: string;
  description?: string;
  labels?: AllureLabel[];
  links?: AllureLink[];
  titlePath?: string[];
}

/**
 * Labels kept from the raw results (values sanitized). Everything else is
 * dropped; the grouping labels (parentSuite, suite, subSuite, feature, story)
 * are rebuilt by SQAF.
 */
const KEPT_LABELS = new Set(['language', 'framework', 'tag', 'severity', 'owner', 'epic', '_fallbackTestCaseId']);

const MODULES: Readonly<Record<string, string>> = { authentication: 'Authentication', products: 'Products', checkout: 'Checkout' };
const capitalize = (word: string): string => (word ? word[0]!.toUpperCase() + word.slice(1) : word);

export interface Grouping {
  readonly parentSuite: string;
  readonly suite: string;
  readonly subSuite: string;
}

/**
 * Suite → module → scenario, from the spec file (POSIX, relative to the
 * repository) and the test title. Data-driven cases (`TC9: … [jeans]`) share
 * their scenario and keep the case as a parameter.
 */
export function groupingOf(file: string, title: string, project: string): Grouping {
  const parts = file.split('/');
  const scenario = title.replace(/ \[[^\]]*\]$/, '');
  if (parts[0] === 'tests' && parts[1] === 'e2e') {
    const area = parts[2] ?? '';
    return { parentSuite: `E2E (${project || 'chromium'})`, suite: MODULES[area] ?? capitalize(area), subSuite: scenario };
  }
  const stem = (parts.at(-1) ?? '').replace(/\.(spec|test)\.ts$/, '');
  if (parts[0] === 'tests' && parts[1] === 'integration') return { parentSuite: 'Integration', suite: capitalize(parts[2] ?? ''), subSuite: stem };
  if (parts[0] === 'tests' && parts[1] === 'unit') return { parentSuite: 'Unit', suite: capitalize(parts[2] ?? ''), subSuite: stem };
  return { parentSuite: project || 'Other', suite: stem, subSuite: scenario };
}

/** May a screenshot of this spec file appear in the report? */
export function screenshotAllowed(file: string, suites: readonly string[] = SQAF_ALLURE.screenshotSuites): boolean {
  return suites.some((suite) => (suite.endsWith('/') ? file.startsWith(suite) : file === suite));
}

const SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg']);

// ---------------------------------------------------------------------------
// Classification (read-only)
// ---------------------------------------------------------------------------

interface ClassifiedEntry {
  readonly test: string;
  readonly project: string;
  readonly file: string;
  readonly retry: number;
  readonly classification: string;
}

function readClassifications(file: string | undefined): readonly ClassifiedEntry[] {
  if (!file || !existsSync(file)) return [];
  try {
    const report = JSON.parse(readFileSync(file, 'utf8')) as { failures?: ClassifiedEntry[] };
    return Array.isArray(report.failures) ? report.failures : [];
  } catch {
    return [];
  }
}

/** Title segments after the file (describe blocks and test title), redacted like the classification report. */
const titleKey = (segments: readonly string[]): string => redactSecrets(segments.join(' › '));

// ---------------------------------------------------------------------------
// Preparation
// ---------------------------------------------------------------------------

export interface PrepareOptions {
  readonly rawDir: string;
  readonly safeDir: string;
  /** Failure classification report of the same run (read-only). */
  readonly classificationFile?: string;
  readonly context?: SanitizeContext;
  readonly screenshotSuites?: readonly string[];
  /** Test seam: replaces the sanitizer (used to prove that the scan blocks unsafe output). */
  readonly sanitize?: (text: string) => string;
  /** Host name the scanner looks for (defaults to this machine's). */
  readonly host?: string;
}

export interface PrepareOutcome {
  readonly results: number;
  readonly projects: readonly string[];
  readonly attachmentsKept: number;
  readonly attachmentsDropped: number;
  readonly classified: number;
  /** Findings of the fail-closed scan; when not empty nothing was written. */
  readonly leaks: readonly Leak[];
  readonly written: boolean;
}

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'results';

/** Prepared result files of a project carry its prefix, so a new run of that project replaces only its own files. */
export const projectPrefix = (project: string): string => `${slug(project)}--`;

export function prepareAllureResults(options: PrepareOptions): PrepareOutcome {
  const context = options.context ?? defaultSanitizeContext();
  const clean = options.sanitize ?? ((text: string): string => sanitizeText(text, context));
  const suites = options.screenshotSuites ?? SQAF_ALLURE.screenshotSuites;
  const rawFiles = existsSync(options.rawDir) ? readdirSync(options.rawDir) : [];
  const raw: AllureResult[] = rawFiles
    .filter((file) => file.endsWith('-result.json'))
    .map((file) => JSON.parse(readFileSync(join(options.rawDir, file), 'utf8')) as AllureResult);

  const projectOf = (result: AllureResult): string => result.parameters?.find((p) => p.name === 'Project')?.value ?? '';
  const fileOf = (result: AllureResult): string => (result.fullName ?? '').split(' › ')[0]!.replaceAll('\\', '/');
  const segmentsOf = (result: AllureResult): string[] => (result.fullName ?? '').split(' › ').slice(1);

  // Retry index of each attempt: attempts of one test, in start order.
  const attemptsByTest = new Map<string, AllureResult[]>();
  for (const result of raw) {
    const key = [projectOf(result), fileOf(result), titleKey(segmentsOf(result))].join('\0');
    attemptsByTest.set(key, [...(attemptsByTest.get(key) ?? []), result]);
  }
  const retryOf = new Map<AllureResult, number>();
  for (const attempts of attemptsByTest.values()) {
    attempts.sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).forEach((attempt, index) => retryOf.set(attempt, index));
  }

  const classifications = readClassifications(options.classificationFile);
  /**
   * The classification report names a test by its title path without the
   * project (`<file suite> › … › <title>`, or only the titles when the
   * project has no name), already redacted: its LAST segments are compared
   * with the describe blocks and title of the Allure result.
   */
  const classificationOf = (result: AllureResult): string => {
    const segments = segmentsOf(result);
    const key = titleKey(segments);
    const entry = classifications.find(
      (c) =>
        c.project === projectOf(result) &&
        c.file === fileOf(result) &&
        c.retry === retryOf.get(result) &&
        c.test.split(' › ').slice(-segments.length).join(' › ') === key,
    );
    return entry?.classification ?? NOT_CLASSIFIED;
  };

  let kept = 0;
  let dropped = 0;
  let classified = 0;
  const attachmentsToCopy: string[] = [];

  const keepAttachments = (attachments: readonly AllureAttachment[] | undefined, file: string): AllureAttachment[] => {
    const out: AllureAttachment[] = [];
    for (const attachment of attachments ?? []) {
      const ok =
        attachment.name === 'screenshot' &&
        SCREENSHOT_TYPES.has(attachment.type) &&
        /^[A-Za-z0-9._-]+$/.test(attachment.source) &&
        existsSync(join(options.rawDir, attachment.source)) &&
        screenshotAllowed(file, suites);
      if (!ok) {
        dropped += 1;
        continue;
      }
      kept += 1;
      attachmentsToCopy.push(attachment.source);
      out.push({ name: 'screenshot', source: attachment.source, type: attachment.type });
    }
    return out;
  };

  const cleanDetails = (details: AllureStatusDetails | undefined): AllureStatusDetails => {
    const out: AllureStatusDetails = {};
    if (details?.message) out.message = clean(details.message);
    if (details?.trace) out.trace = clean(details.trace);
    for (const flag of ['known', 'muted', 'flaky'] as const) if (details?.[flag] !== undefined) out[flag] = details[flag];
    return out;
  };

  const cleanParameters = (parameters: readonly AllureParameter[] | undefined): AllureParameter[] =>
    (parameters ?? []).map((p) => ({
      name: clean(p.name),
      value: clean(String(p.value)),
      ...(p.excluded !== undefined ? { excluded: p.excluded } : {}),
      ...(p.mode !== undefined ? { mode: p.mode } : {}),
    }));

  const traceability = { links: [] as AllureLink[], labels: [] as AllureLabel[] };
  /** Allure turns annotations it does not know into steps without timing: `<type>: <description>`. */
  const isAnnotationStep = (step: AllureStep): boolean => step.start === undefined && /^[A-Za-z0-9_.@-]+: /.test(step.name ?? '');

  const cleanSteps = (steps: readonly AllureStep[] | undefined, file: string): AllureStep[] => {
    const out: AllureStep[] = [];
    for (const step of steps ?? []) {
      if (isAnnotationStep(step)) {
        const [type, ...rest] = (step.name ?? '').split(': ');
        const description = rest.join(': ');
        if (type === 'sqaf-test-case') {
          const url = /\((https?:\/\/[^\s)]+)\)$/.exec(description)?.[1];
          const id = description.split(':')[0]!;
          if (url) traceability.links.push({ name: clean(`Official ${id}`), url: clean(url), type: 'tms' });
        } else if (type === 'sqaf-baseline-pair') {
          traceability.labels.push({ name: 'baselinePair', value: clean(description) });
        }
        continue; // sqaf-test-data and any other annotation are dropped
      }
      const attachments = keepAttachments(step.attachments, file);
      const children = cleanSteps(step.steps, file);
      // The step that only wrapped a dropped attachment (`test.attach`) is dropped too.
      if ((step.attachments?.length ?? 0) > 0 && attachments.length === 0 && children.length === 0) continue;
      out.push({
        name: clean(step.name ?? ''),
        ...(step.status !== undefined ? { status: step.status } : {}),
        ...(step.stage !== undefined ? { stage: step.stage } : {}),
        ...(step.start !== undefined ? { start: step.start } : {}),
        ...(step.stop !== undefined ? { stop: step.stop } : {}),
        statusDetails: cleanDetails(step.statusDetails),
        steps: children,
        attachments,
        parameters: cleanParameters(step.parameters),
      });
    }
    return out;
  };

  const prepared: Array<{ readonly project: string; readonly result: AllureResult }> = [];
  for (const result of raw) {
    traceability.links = [];
    traceability.labels = [];
    const project = projectOf(result);
    const file = fileOf(result);
    const segments = segmentsOf(result);
    const title = segments.at(-1) ?? result.name ?? '';
    const group = groupingOf(file, clean(title), project);
    const steps = cleanSteps(result.steps, file);

    const labels: AllureLabel[] = (result.labels ?? [])
      .filter((label) => KEPT_LABELS.has(label.name))
      .map((label) => ({ name: label.name, value: clean(label.value) }));
    labels.push(
      { name: 'parentSuite', value: group.parentSuite },
      { name: 'suite', value: group.suite },
      { name: 'subSuite', value: group.subSuite },
      { name: 'feature', value: group.suite },
      { name: 'story', value: group.subSuite },
      ...traceability.labels,
    );
    if (result.status !== 'passed' && result.status !== 'skipped') {
      labels.push({ name: CLASSIFICATION_LABEL, value: classificationOf(result) });
      classified += 1;
    }

    const parameters = cleanParameters(result.parameters);
    const dataCase = / \[([^\]]*)\]$/.exec(title)?.[1];
    if (dataCase !== undefined) parameters.push({ name: 'Case', value: clean(dataCase) });

    const links = [...(result.links ?? []), ...traceability.links]
      .filter((link) => /^https?:\/\//.test(link.url))
      .map((link) => ({ ...(link.name ? { name: clean(link.name) } : {}), url: clean(link.url), ...(link.type ? { type: link.type } : {}) }));

    prepared.push({
      project,
      result: {
        uuid: result.uuid,
        ...(result.historyId !== undefined ? { historyId: result.historyId } : {}),
        ...(result.testCaseId !== undefined ? { testCaseId: result.testCaseId } : {}),
        name: clean(result.name ?? title),
        fullName: clean([file, ...segments].join(' › ')),
        ...(result.description ? { description: clean(result.description) } : {}),
        ...(result.status !== undefined ? { status: result.status } : {}),
        ...(result.stage !== undefined ? { stage: result.stage } : {}),
        ...(result.start !== undefined ? { start: result.start } : {}),
        ...(result.stop !== undefined ? { stop: result.stop } : {}),
        statusDetails: cleanDetails(result.statusDetails),
        steps,
        attachments: keepAttachments(result.attachments, file),
        parameters,
        labels,
        links,
        titlePath: [group.parentSuite, group.suite, group.subSuite],
      },
    });
  }

  const projects = [...new Set(prepared.map((p) => p.project))];
  const outcome = { results: prepared.length, projects, attachmentsKept: kept, attachmentsDropped: dropped, classified };

  // Stage, scan (fail-closed), then publish into the safe directory.
  const staging = `${resolve(options.safeDir)}.staging`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  for (const { project, result } of prepared) {
    const prefix = projectPrefix(project);
    for (const attachment of [...result.attachments!, ...collectStepAttachments(result.steps)]) {
      attachment.source = `${prefix}${attachment.source}`;
    }
    writeFileSync(join(staging, `${prefix}${result.uuid}-result.json`), JSON.stringify(result));
  }
  for (const { project, result } of prepared) {
    const prefix = projectPrefix(project);
    for (const attachment of [...result.attachments!, ...collectStepAttachments(result.steps)]) {
      const original = attachment.source.slice(prefix.length);
      if (attachmentsToCopy.includes(original)) copyFileSync(join(options.rawDir, original), join(staging, attachment.source));
    }
  }
  writeFileSync(join(staging, 'environment.properties'), environmentProperties(projects, clean));

  const leaks = scanPaths([staging], { rootDir: staging, ...(options.host ? { host: options.host } : {}) });
  if (leaks.length > 0) {
    rmSync(staging, { recursive: true, force: true });
    return { ...outcome, leaks, written: false };
  }

  mkdirSync(options.safeDir, { recursive: true });
  const prefixes = projects.map(projectPrefix);
  for (const file of readdirSync(options.safeDir)) {
    if (prefixes.some((prefix) => file.startsWith(prefix)) || file === 'environment.properties') {
      rmSync(join(options.safeDir, file), { force: true });
    }
  }
  for (const file of readdirSync(staging)) renameSync(join(staging, file), join(options.safeDir, file));
  rmSync(staging, { recursive: true, force: true });
  return { ...outcome, leaks: [], written: true };
}

function collectStepAttachments(steps: readonly AllureStep[] | undefined): AllureAttachment[] {
  return (steps ?? []).flatMap((step) => [...(step.attachments ?? []), ...collectStepAttachments(step.steps)]);
}

function environmentProperties(projects: readonly string[], clean: (text: string) => string): string {
  const lines = [
    'Framework=SQAF (Playwright + TypeScript)',
    'SUT=automationexercise.com',
    `Projects=${clean(projects.join(', ') || '-')}`,
    `Node=${process.version}`,
  ];
  return `${lines.join('\n')}\n`;
}

export { describeLeaks };
