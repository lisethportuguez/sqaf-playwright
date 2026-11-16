import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { runPlaywright } from '../support/run-playwright';

/**
 * What CI publishes when the unit tests or the baseline fail (Stage 1 step
 * "Upload failure evidence", restricted in the Stage 4 E4.5 final closure).
 * Raw test outputs (test-results/) showed code frames with fictitious
 * e-mails and URL credentials, so ONLY the redacted failure classification is
 * published. A child Playwright run (no browser, no SUT) reproduces a failed
 * CI unit run in a sandbox laid out like the CI workspace, and every file the
 * reachable upload steps would publish is scanned.
 */

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');
const STEP_NAMES = [...WORKFLOW.matchAll(/\n      - name: (.+)/g)].map((match) => match[1]!.trim());

function stepBlock(name: string): string {
  const start = WORKFLOW.indexOf(`      - name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const next = WORKFLOW.indexOf('\n      - name: ', start + 1);
  return WORKFLOW.slice(start, next === -1 ? undefined : next);
}

/** `path:` of an upload step: one line, or a `|` block of lines. */
function uploadPaths(block: string): string[] {
  const lines = block.split('\n');
  const index = lines.findIndex((line) => /^\s+path:/.test(line));
  if (index < 0) return [];
  const inline = lines[index]!.replace(/^\s+path:\s*/, '').trim();
  if (inline !== '|') return [inline];
  const indent = lines[index]!.search(/\S/);
  const out: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.trim() === '' || line.search(/\S/) <= indent) break;
    out.push(line.trim());
  }
  return out;
}

/**
 * Upload steps that can run after a unit or baseline failure: every upload
 * step after "Unit tests (framework)" whose condition does not depend on a
 * later step that is skipped once something failed (`steps.<id>.outcome`).
 */
function reachableUploads(): string[] {
  const unit = STEP_NAMES.indexOf('Unit tests (framework)');
  return STEP_NAMES.slice(unit + 1).filter((name) => {
    const block = stepBlock(name);
    return block.includes('uses: actions/upload-artifact@') && !/if: .*steps\./.test(block);
  });
}

/** actions/upload-artifact semantics for plain files and `dir/` (no wildcard or exclusion is allowed here). */
function selects(pattern: string, file: string): boolean {
  expect(pattern, 'only plain paths').not.toMatch(/[*!?]/);
  return pattern.endsWith('/') ? file.startsWith(pattern) : file === pattern;
}

function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else out.push(relative(root, path).replaceAll('\\', '/'));
    }
  };
  walk(root);
  return out.sort();
}

/** Minimal ZIP reader: the HTML report embeds its data as a base64 ZIP. */
function unzip(buffer: Buffer): Map<string, Buffer> {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a ZIP archive');
  const entries = new Map<string, Buffer>();
  let pointer = buffer.readUInt32LE(end + 16);
  for (let n = buffer.readUInt16LE(end + 10); n > 0; n -= 1) {
    const method = buffer.readUInt16LE(pointer + 10);
    const size = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const local = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = buffer.subarray(start, start + size);
    entries.set(name, method === 0 ? data : inflateRawSync(data));
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

interface ArtifactText {
  readonly path: string;
  readonly text: string;
}

function expand(root: string, files: readonly string[]): ArtifactText[] {
  const out: ArtifactText[] = [];
  const add = (path: string, content: Buffer): void => {
    const text = content.toString('latin1');
    out.push({ path, text });
    if (/\.zip$/i.test(path)) {
      for (const [name, entry] of unzip(content)) add(`${path}!${name}`, entry);
      return;
    }
    const embedded = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(text);
    if (embedded) add(`${path}!embedded.zip`, Buffer.from(embedded[1]!, 'base64'));
  };
  for (const file of files) add(file, readFileSync(join(root, file)));
  return out;
}

/** Fictitious values of the samples (tests/unit/support/failure-evidence). */
const FORBIDDEN: Readonly<Record<string, RegExp>> = {
  'e-mail': /[A-Za-z0-9._%+-]+(?:@|%40)(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}/,
  'account data id': /user-evidence-\d/,
  'URL credentials': /user:secret/,
  password: /Sqaf#z{16}/,
  'card number': /4111\s*1111\s*1111\s*1111/,
  'source code frame': /expect\(url, 'must not contain credentials'\)/,
};

function findSensitive(artifacts: readonly ArtifactText[]): string[] {
  const findings: string[] = [];
  for (const artifact of artifacts) {
    for (const [kind, pattern] of Object.entries(FORBIDDEN)) {
      if (pattern.test(artifact.path)) findings.push(`${kind} (name): ${artifact.path}`);
      if (pattern.test(artifact.text)) findings.push(`${kind} (content): ${artifact.path}`);
    }
  }
  return findings;
}

test.describe('static contract', () => {
  test('the unit and baseline failure evidence publishes ONLY the failure classification', () => {
    const block = stepBlock('Upload failure evidence');
    expect(block).toContain('if: ${{ failure() }}');
    expect(uploadPaths(block)).toEqual(['reports/failure-classification.json']);
    expect(block).not.toMatch(/^\s+[^#\n]*(test-results|playwright-report)/m);
  });

  test('after a unit or baseline failure only the classification uploads can run', () => {
    expect(reachableUploads()).toEqual(['Upload baseline classification', 'Upload failure evidence']);
    const paths = reachableUploads().flatMap((name) => uploadPaths(stepBlock(name)));
    expect([...new Set(paths)]).toEqual(['reports/failure-classification.json']);
  });

  test('the E0 baseline steps are unchanged', () => {
    expect(stepBlock('Run baseline')).toContain('npm run test:baseline');
    expect(stepBlock('Upload baseline classification')).toMatch(/^\s+path: reports\/failure-classification\.json$/m);
    expect(stepBlock('Upload baseline classification')).toContain('if: ${{ !cancelled() }}');
  });
});

test('runtime: a failed unit run publishes no e-mail, data id, credential, password, card or source code', async ({}, testInfo) => {
  const sandbox = testInfo.outputPath('ci');
  const run = runPlaywright(['test', '--config=tests/unit/support/failure-evidence.config.ts'], {
    SAMPLE_SANDBOX: sandbox,
    CI: '1',
  });
  const consoleOutput = run.stdout + run.stderr;
  expect(run.status, consoleOutput).toBe(1);

  const files = listFiles(sandbox);
  const paths = reachableUploads().flatMap((name) => uploadPaths(stepBlock(name)));
  const published = files.filter((file) => paths.some((pattern) => selects(pattern, file)));
  expect(published).toEqual(['reports/failure-classification.json']);

  // The published file keeps its diagnostic value: 3 failed attempts, each with its file, line and classification.
  const report = JSON.parse(readFileSync(join(sandbox, 'reports', 'failure-classification.json'), 'utf8')) as {
    failures: Array<{ test: string; file: string; line: number; classification: string; errorExcerpt: string }>;
  };
  expect(report.failures).toHaveLength(3);
  for (const failure of report.failures) {
    expect(failure.file).toMatch(/unit-failures\.sample\.ts$/);
    expect(failure.line).toBeGreaterThan(0);
    expect(failure.classification).toMatch(/^[a-z]+\/[a-z-]+$/);
    expect(failure.errorExcerpt.length).toBeGreaterThan(0);
  }
  expect(report.failures.map((f) => f.test)).toContainEqual(expect.stringContaining('title with an e-mail [e-mail redacted] fails'));

  // The scan of everything that would be published finds nothing.
  expect(findSensitive(expand(sandbox, published))).toEqual([]);

  // Controls: the raw outputs that are NO LONGER published contain every fictitious value (the scan detects them).
  const unpublished = expand(sandbox, files.filter((file) => !published.includes(file)));
  const kinds = new Set(findSensitive(unpublished).map((finding) => finding.replace(/ \(.*$/, '')));
  expect([...kinds].sort(), files.join('\n')).toEqual(Object.keys(FORBIDDEN).sort());
  expect(files.some((file) => file.startsWith('test-results/') && file.endsWith('/error-context.md'))).toBe(true);
  expect(files.some((file) => file.startsWith('playwright-report/'))).toBe(true);
});
