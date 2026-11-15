import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

/**
 * Static check of the CI path filters (ADR-0003, Stage 1). GitHub evaluates
 * `paths` patterns in order: a later positive pattern re-includes what an
 * earlier `!` pattern excluded. These tests pin that every critical path is
 * re-included AFTER the documentation exclusions, that push and pull_request
 * share the same list, and that manual runs are never filtered.
 * The real-event verification is recorded in docs/validation/E1-configuration.md.
 */

const WORKFLOW = readFileSync('.github/workflows/ci.yml', 'utf8').replaceAll('\r\n', '\n');

function pathsOf(event: 'push' | 'pull_request'): string[] {
  const block = new RegExp(`\\n  ${event}:\\n([\\s\\S]*?)(?=\\n  \\w[\\w_]*:)`).exec(WORKFLOW)?.[1] ?? '';
  const list = /\n?    paths:\n((?:      - .*\n?)+)/.exec(block)?.[1] ?? '';
  return [...list.matchAll(/      - '([^']+)'/g)].map((match) => match[1]!);
}

const CRITICAL = [
  '.github/workflows/**',
  'config/**',
  'src/**',
  'tests/**',
  'baseline/**',
  'playwright.config.ts',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  '.nvmrc',
];

test('push and pull_request use the same path filter', () => {
  const push = pathsOf('push');
  expect(push.length).toBeGreaterThan(0);
  expect(pathsOf('pull_request')).toEqual(push);
});

test('documentation is excluded, everything else is included by default', () => {
  const paths = pathsOf('push');
  expect(paths[0]).toBe('**');
  expect(paths).toContain('!docs/**');
  expect(paths).toContain('!**.md');
  expect(WORKFLOW).not.toMatch(/^\s+paths-ignore:/m);
});

test('every critical path is re-included after the last exclusion', () => {
  const paths = pathsOf('push');
  const lastExclusion = Math.max(...paths.map((path, index) => (path.startsWith('!') ? index : -1)));
  for (const critical of CRITICAL) {
    expect(paths.indexOf(critical), critical).toBeGreaterThan(lastExclusion);
  }
});

test('manual execution is available and never filtered', () => {
  expect(WORKFLOW).toMatch(/\n  workflow_dispatch:\s*\n/);
  expect(WORKFLOW).not.toMatch(/workflow_dispatch:\n\s+paths/);
});

test('the pipeline runs typecheck, unit tests and the baseline in this order', () => {
  const steps = ['npm run typecheck', 'npm run test:unit', 'npm run test:baseline'].map((step) => WORKFLOW.indexOf(step));
  expect(steps.every((index) => index > 0)).toBe(true);
  expect([...steps].sort((a, b) => a - b)).toEqual(steps);
});
