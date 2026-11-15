import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Test support: static import analysis for the layer dependency rule
 * (architecture.md §2, ADR-0007). Pure functions over an in-memory file map,
 * so the analyzer itself can be tested with synthetic files.
 *
 *  - Comments and string/template contents are ignored (no false positives
 *    from JSDoc or glob strings).
 *  - External specifiers (`@playwright/test`, `node:*`, any bare package)
 *    are not layer dependencies and are ignored.
 *  - `import type` IS a dependency: a type from a higher layer couples the
 *    layers just like a value does.
 *  - `@sqaf/*` resolves to `src/*` (tsconfig `paths`).
 */

export type Layer =
  | 'config'
  | 'utils'
  | 'errors'
  | 'pages'
  | 'data'
  | 'api'
  | 'fixtures'
  | 'reporting'
  | 'suites'
  | 'unit'
  | 'baseline'
  | 'playwright-config';

/** Layers each layer may import (its own layer is always allowed). */
export const ALLOWED: Readonly<Record<Layer, readonly Layer[] | 'any'>> = {
  config: [],
  utils: ['config'],
  errors: ['utils', 'config'],
  pages: ['errors', 'utils', 'config'],
  data: ['errors', 'utils', 'config'],
  api: ['errors', 'utils', 'config'],
  fixtures: ['pages', 'data', 'api', 'errors', 'utils', 'config'],
  reporting: ['errors', 'utils', 'config'],
  suites: ['fixtures'],
  unit: 'any',
  baseline: ['config'],
  'playwright-config': ['config'],
};

const LAYER_PREFIXES: ReadonlyArray<readonly [string, Layer]> = [
  ['config/', 'config'],
  ['src/utils/', 'utils'],
  ['src/errors/', 'errors'],
  ['src/pages/', 'pages'],
  ['src/data/', 'data'],
  ['src/api/', 'api'],
  ['src/fixtures/', 'fixtures'],
  ['src/reporting/', 'reporting'],
  ['tests/integration/', 'suites'],
  ['tests/e2e/', 'suites'],
  ['tests/unit/', 'unit'],
  ['baseline/', 'baseline'],
];

export function layerOf(file: string): Layer | undefined {
  if (file === 'playwright.config.ts') return 'playwright-config';
  return LAYER_PREFIXES.find(([prefix]) => file.startsWith(prefix))?.[1];
}

/** Removes comments and blanks out string/template contents, keeping import specifiers. */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];
    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      out += ' ';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const start = i;
      i++;
      while (i < source.length && source[i] !== char) i += source[i] === '\\' ? 2 : 1;
      i++;
      out += source.slice(start, i);
      continue;
    }
    out += char;
    i++;
  }
  return out;
}

const STATIC_FROM = /(?:^|[;\n}])\s*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/g;
const SIDE_EFFECT = /(?:^|[;\n])\s*import\s*(['"])([^'"]+)\1/g;
const DYNAMIC = /\b(?:import|require)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

export function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  const specifiers: string[] = [];
  for (const pattern of [STATIC_FROM, SIDE_EFFECT, DYNAMIC]) {
    for (const match of code.matchAll(pattern)) specifiers.push(match[2]!);
  }
  return specifiers;
}

/** Repo-relative POSIX path of an internal import, `undefined` for external ones, `null` if unresolvable. */
export function resolveSpecifier(
  fromFile: string,
  specifier: string,
  exists: (file: string) => boolean,
): string | undefined | null {
  let base: string;
  if (specifier.startsWith('.')) base = path.posix.join(path.posix.dirname(fromFile), specifier);
  else if (specifier.startsWith('@sqaf/')) base = `src/${specifier.slice('@sqaf/'.length)}`;
  else return undefined;
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (candidate.endsWith('.ts') && exists(candidate)) return candidate;
  }
  return null;
}

export interface Violation {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export function findViolations(files: ReadonlyMap<string, string>): Violation[] {
  const violations: Violation[] = [];
  const exists = (file: string): boolean => files.has(file);
  for (const [from, source] of files) {
    const fromLayer = layerOf(from);
    if (fromLayer === undefined) {
      violations.push({ from, to: '-', reason: 'file outside every known layer' });
      continue;
    }
    for (const specifier of importSpecifiers(source)) {
      const to = resolveSpecifier(from, specifier, exists);
      if (to === undefined) continue;
      if (to === null) {
        violations.push({ from, to: specifier, reason: 'unresolvable internal import' });
        continue;
      }
      const toLayer = layerOf(to);
      const allowed = ALLOWED[fromLayer];
      if (toLayer === fromLayer || allowed === 'any') continue;
      if (toLayer === undefined || !allowed.includes(toLayer)) {
        violations.push({ from, to, reason: `${fromLayer} must not import ${toLayer ?? 'an unknown layer'}` });
      }
    }
  }
  return violations;
}

/** Loads every .ts file of the layers (and playwright.config.ts) as repo-relative POSIX paths. */
export function loadRepositorySources(root: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (relativeDir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(path.join(root, relativeDir));
    } catch {
      return;
    }
    for (const entry of entries) {
      const relative = `${relativeDir}/${entry}`;
      if (statSync(path.join(root, relative)).isDirectory()) walk(relative);
      else if (entry.endsWith('.ts')) files.set(relative, readFileSync(path.join(root, relative), 'utf8'));
    }
  };
  for (const dir of ['config', 'src', 'tests', 'baseline']) walk(dir);
  files.set('playwright.config.ts', readFileSync(path.join(root, 'playwright.config.ts'), 'utf8'));
  return files;
}
