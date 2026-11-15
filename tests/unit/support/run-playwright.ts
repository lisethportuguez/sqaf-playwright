import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Test support: runs the Playwright CLI in a child process with a controlled
 * environment. Inherited SQAF_*, CI and GITHUB_STEP_SUMMARY variables are
 * removed first so every case states its own conditions explicitly.
 */
const CLI = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');

export interface PlaywrightRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runPlaywright(args: readonly string[], env: Record<string, string> = {}): PlaywrightRun {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (key.startsWith('SQAF_') || key === 'CI' || key === 'GITHUB_STEP_SUMMARY') continue;
    // Variables injected by the parent Playwright run must not leak into the child.
    if (key.startsWith('TEST_') || key.startsWith('PW_') || key.startsWith('PLAYWRIGHT_')) continue;
    base[key] = value;
  }
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    env: { ...base, FORCE_COLOR: '0', ...env },
    encoding: 'utf8',
    timeout: 120_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
