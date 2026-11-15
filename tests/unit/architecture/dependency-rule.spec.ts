import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  findViolations,
  importSpecifiers,
  layerOf,
  loadRepositorySources,
  stripComments,
} from '../support/dependency-graph';

/**
 * ARCHITECTURE (Stage 2): the layer dependency rule of architecture.md §2.
 *
 *   tests → fixtures → (pages, data, api) → errors → utils;  config is transversal.
 *
 * Sibling layers (pages, data, api) never import each other, suites import
 * only the Fixtures layer, and no lower layer imports a higher one.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..');

test.describe('the repository', () => {
  const sources = loadRepositorySources(ROOT);

  test('respects the layer dependency rule', () => {
    expect(findViolations(sources)).toEqual([]);
  });

  test('analyzes every layer that exists today', () => {
    const layers = new Set([...sources.keys()].map(layerOf));
    for (const layer of ['config', 'utils', 'errors', 'pages', 'fixtures', 'reporting', 'suites', 'unit', 'baseline']) {
      expect(layers, layer).toContain(layer);
    }
  });

  test('SQAF suites use Page Objects, never raw locators', () => {
    const suites = [...sources].filter(([file]) => layerOf(file) === 'suites');
    expect(suites.length).toBeGreaterThan(0);
    for (const [file, source] of suites) {
      expect(stripComments(source), file).not.toMatch(/\.(locator|getBy[A-Z]\w*|\$\$?)\(/);
    }
  });
});

test.describe('the analyzer itself (synthetic files)', () => {
  const files = (entries: Record<string, string>): Map<string, string> => new Map(Object.entries(entries));

  test('reports upward, sibling and suite-to-page imports', () => {
    const violations = findViolations(
      files({
        'src/utils/a.ts': "import { E } from '../errors/e';",
        'src/errors/e.ts': 'export class E {}',
        'src/pages/p.ts': "import { d } from '../data/d';\nimport { f } from '../fixtures/f';",
        'src/data/d.ts': 'export const d = 1;',
        'src/fixtures/f.ts': 'export const f = 1;',
        'tests/integration/x.spec.ts': "import { P } from '@sqaf/pages/p';",
      }),
    );
    expect(violations.map((violation) => `${violation.from} -> ${violation.to}`)).toEqual([
      'src/utils/a.ts -> src/errors/e.ts',
      'src/pages/p.ts -> src/data/d.ts',
      'src/pages/p.ts -> src/fixtures/f.ts',
      'tests/integration/x.spec.ts -> src/pages/p.ts',
    ]);
  });

  test('counts type-only and multi-line imports, ignores external packages and comments', () => {
    const source = [
      "import type { Page } from '@playwright/test';",
      "import { readFileSync } from 'node:fs';",
      '/* import { X } from "../fixtures/x"; */',
      "// import { Y } from '../fixtures/y';",
      "const glob = 'docs/**/*.md';",
      'import type {',
      '  F,',
      "} from '../fixtures/f';",
    ].join('\n');
    expect(importSpecifiers(source)).toEqual(['@playwright/test', 'node:fs', '../fixtures/f']);
    const violations = findViolations(files({ 'src/pages/p.ts': source, 'src/fixtures/f.ts': 'export type F = 1;' }));
    expect(violations).toHaveLength(1);
  });

  test('accepts the allowed directions and resolves @sqaf aliases and index files', () => {
    expect(
      findViolations(
        files({
          'tests/integration/x.spec.ts': "import { test } from '@sqaf/fixtures';",
          'src/fixtures/index.ts': "import { P } from '../pages';\nimport { c } from '../../config';",
          'src/pages/index.ts': "export { P } from './p';",
          'src/pages/p.ts': "import { g } from '../errors/g';\nexport class P {}",
          'src/errors/g.ts': "import { u } from '../utils/u';",
          'src/utils/u.ts': "import { c } from '../../config';",
          'config/index.ts': 'export const c = 1;',
        }),
      ),
    ).toEqual([]);
  });

  test('reports unresolvable internal imports and files outside the layers', () => {
    const violations = findViolations(
      files({ 'src/pages/p.ts': "import { x } from './missing';", 'src/unknown/u.ts': '' }),
    );
    expect(violations.map((violation) => violation.reason)).toEqual([
      'unresolvable internal import',
      'file outside every known layer',
    ]);
  });
});
