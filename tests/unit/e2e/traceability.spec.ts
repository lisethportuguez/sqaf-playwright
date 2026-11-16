import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  BASELINE_PAIR_ANNOTATION,
  CHECKOUT_TIMEOUT,
  OFFICIAL_TEST_CASES_URL,
  SCENARIOS,
  scenario,
  TEST_CASE_ANNOTATION,
  type ScenarioBlock,
  type ScenarioId,
} from '../../../src/fixtures/scenarios';
import { runPlaywright } from '../support/run-playwright';

/**
 * Stage 4 — traceability contract of the functional scenarios (ADR-0010).
 *
 * The catalog is the approved scope, and every suite under tests/e2e follows
 * it: one file per scenario in its area folder, the official title, the
 * tags and the annotations. The suites are LISTED (`playwright test --list`),
 * never run: this contract does not touch the SUT.
 */

/** The 15 scenarios approved for Stage 4 (ADR-0010 D1), with their official names. */
const APPROVED: Readonly<Record<string, string>> = {
  TC1: 'Register User',
  TC2: 'Login User with correct email and password',
  TC3: 'Login User with incorrect email and password',
  TC4: 'Logout User',
  TC5: 'Register User with existing email',
  TC8: 'Verify All Products and product detail page',
  TC9: 'Search Product',
  TC12: 'Add Products in Cart',
  TC13: 'Verify Product quantity in Cart',
  TC14: 'Place Order: Register while Checkout',
  TC15: 'Place Order: Register before Checkout',
  TC16: 'Place Order: Login before Checkout',
  TC17: 'Remove Products From Cart',
  TC18: 'View Category Products',
  TC23: 'Verify address details in checkout',
};

/** Blocks already delivered: every scenario of these blocks must be implemented. */
const DELIVERED_BLOCKS: readonly ScenarioBlock[] = ['E4.1', 'E4.2', 'E4.3'];

interface ListedTest {
  readonly file: string;
  /** Titles of the enclosing describes and the test, without the file. */
  readonly titlePath: readonly string[];
  readonly tags: readonly string[];
  readonly annotations: ReadonlyArray<{ readonly type: string; readonly description?: string }>;
}

interface JsonSuite {
  readonly title: string;
  readonly specs?: ReadonlyArray<{
    readonly file: string;
    readonly title: string;
    readonly tags: readonly string[];
    readonly tests: ReadonlyArray<{ readonly annotations: ListedTest['annotations'] }>;
  }>;
  readonly suites?: readonly JsonSuite[];
}

function listTests(project: string): ListedTest[] {
  const run = runPlaywright(['test', '--list', `--project=${project}`, '--reporter=json']);
  expect(run.status, run.stderr).toBe(0);
  const report = JSON.parse(run.stdout) as { suites: JsonSuite[]; errors: unknown[] };
  expect(report.errors).toEqual([]);
  const out: ListedTest[] = [];
  const walk = (suite: JsonSuite, path: readonly string[]): void => {
    for (const spec of suite.specs ?? []) {
      for (const listed of spec.tests) {
        out.push({ file: spec.file, titlePath: [...path, spec.title], tags: spec.tags, annotations: listed.annotations });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...path, child.title]);
  };
  // The top-level suites are the files: their title is not part of the test title.
  for (const file of report.suites) walk(file, []);
  return out;
}

const CREDENTIAL_FIXTURE = /[{,]\s*(?:testUser|newUserData)\b[^}]*}\s*\)\s*=>/;
const TITLE = /^(TC\d+): (.+?)(?: \[([a-z0-9-]+)\])?$/;

test.describe('the scenario catalog', () => {
  test('is exactly the approved scope, with the official names', () => {
    const catalog = Object.fromEntries(Object.entries(SCENARIOS).map(([id, definition]) => [id, definition.name]));
    expect(catalog).toEqual(APPROVED);
    for (const [id, definition] of Object.entries(SCENARIOS)) expect(id).toBe(`TC${definition.number}`);
    expect(Object.isFrozen(SCENARIOS)).toBe(true);
    expect(Object.isFrozen(SCENARIOS.TC1)).toBe(true);
  });

  test('blocks, smoke selection and account usage match ADR-0010', () => {
    const ids = (predicate: (d: (typeof SCENARIOS)[ScenarioId]) => boolean): string[] =>
      Object.entries(SCENARIOS)
        .filter(([, definition]) => predicate(definition))
        .map(([id]) => id);
    expect(ids((d) => d.block === 'E4.1')).toEqual(['TC1', 'TC2', 'TC3', 'TC4', 'TC5']);
    expect(ids((d) => d.block === 'E4.2')).toEqual(['TC8', 'TC9', 'TC12', 'TC13', 'TC17', 'TC18']);
    expect(ids((d) => d.block === 'E4.3')).toEqual(['TC14', 'TC15', 'TC16', 'TC23']);
    expect(ids((d) => d.smoke)).toEqual(['TC2', 'TC3', 'TC8', 'TC9', 'TC12', 'TC16']);
    expect(ids((d) => d.account)).toEqual(['TC1', 'TC2', 'TC4', 'TC5', 'TC14', 'TC15', 'TC16', 'TC23']);
    expect(ids((d) => d.baselinePair !== undefined)).toEqual(['TC1', 'TC3', 'TC8', 'TC9', 'TC12']);
  });

  test('scenario() builds the title, tags and annotations', () => {
    expect(scenario('TC1')).toEqual({
      id: 'TC1',
      definition: SCENARIOS.TC1,
      title: 'TC1: Register User',
      timeout: undefined,
      details: {
        tag: ['@regression', '@account'],
        annotation: [
          { type: TEST_CASE_ANNOTATION, description: `TC1: Register User (${OFFICIAL_TEST_CASES_URL})` },
          {
            type: BASELINE_PAIR_ANNOTATION,
            description: 'baseline/baseline.spec.ts › TC1 - Register User › registers a new user through the UI',
          },
        ],
      },
    });
    expect(scenario('TC2').details.tag).toEqual(['@regression', '@smoke', '@account']);
    expect(scenario('TC3').details.tag).toEqual(['@regression', '@smoke']);
    expect(scenario('TC4').details.annotation).toHaveLength(1);
  });
});

test.describe('the e2e suites (listed, not run)', () => {
  const listed = listTests('chromium');

  test('every test is a catalog scenario with its official title', () => {
    expect(listed.length).toBeGreaterThan(0);
    for (const entry of listed) {
      expect(entry.titlePath, entry.file).toHaveLength(1);
      const match = TITLE.exec(entry.titlePath[0]!);
      expect(match, entry.titlePath[0]).not.toBeNull();
      const id = match![1] as ScenarioId;
      expect(Object.keys(SCENARIOS), entry.titlePath[0]).toContain(id);
      expect(match![2]).toBe(SCENARIOS[id].name);
    }
  });

  test('one spec file per scenario, in its area folder, named tc<NN>-*.spec.ts', () => {
    const filesById = new Map<string, Set<string>>();
    for (const entry of listed) {
      const id = TITLE.exec(entry.titlePath[0]!)![1] as ScenarioId;
      const { area, number } = SCENARIOS[id];
      expect(entry.file).toMatch(new RegExp(`^tests/e2e/${area}/tc${String(number).padStart(2, '0')}-[a-z0-9-]+\\.spec\\.ts$`));
      filesById.set(id, (filesById.get(id) ?? new Set()).add(entry.file));
    }
    for (const [id, files] of filesById) expect([...files], id).toHaveLength(1);
    const files = [...filesById.values()].flatMap((set) => [...set]);
    expect(new Set(files).size).toBe(files.length);
  });

  test('tags and annotations come from the catalog', () => {
    for (const entry of listed) {
      const id = TITLE.exec(entry.titlePath[0]!)![1] as ScenarioId;
      const expected = scenario(id).details;
      // The JSON reporter lists tags without "@".
      expect(entry.tags, entry.titlePath[0]).toEqual((expected.tag as string[]).map((tag) => tag.slice(1)));
      expect(
        entry.annotations.map(({ type, description }) => ({ type, description })),
        entry.titlePath[0],
      ).toEqual(expected.annotation);
    }
  });

  test('@account is declared exactly by the suites that create accounts', () => {
    for (const entry of listed) {
      const usesAccount = CREDENTIAL_FIXTURE.test(readFileSync(entry.file, 'utf8'));
      expect(entry.tags.includes('account'), entry.file).toBe(usesAccount);
    }
  });

  test('every scenario of the delivered blocks is implemented', () => {
    const implemented = new Set(listed.map((entry) => TITLE.exec(entry.titlePath[0]!)![1]));
    const due = Object.entries(SCENARIOS)
      .filter(([, definition]) => DELIVERED_BLOCKS.includes(definition.block))
      .map(([id]) => id);
    expect(due.filter((id) => !implemented.has(id))).toEqual([]);
  });

  test('only the checkout scenarios raise the timeout, to CHECKOUT_TIMEOUT, and their specs apply it', () => {
    const raised = Object.entries(SCENARIOS)
      .filter(([, definition]) => definition.timeout !== undefined)
      .map(([id, definition]) => [id, definition.timeout]);
    expect(raised).toEqual([
      ['TC14', CHECKOUT_TIMEOUT],
      ['TC15', CHECKOUT_TIMEOUT],
      ['TC16', CHECKOUT_TIMEOUT],
      ['TC23', CHECKOUT_TIMEOUT],
    ]);
    expect(CHECKOUT_TIMEOUT).toBeLessThanOrEqual(60_000);
    for (const entry of listed) {
      const id = TITLE.exec(entry.titlePath[0]!)![1] as ScenarioId;
      const source = readFileSync(entry.file, 'utf8');
      // No other way of changing timeouts in a scenario (setTimeout(<literal>), slow(), describe.configure).
      expect(source.match(/test\.setTimeout\([^)]*\)/g) ?? [], entry.file).toEqual(
        SCENARIOS[id].timeout === undefined ? [] : ['test.setTimeout(tc.timeout!)'],
      );
      expect(source, entry.file).not.toMatch(/test\.slow\(|describe\.configure\(|timeout:\s*\d/);
    }
  });

  test('baseline pairs name existing Stage 0 baseline tests', () => {
    const baseline = new Set(listTests('baseline').map((entry) => entry.titlePath.join(' › ')));
    for (const [id, definition] of Object.entries(SCENARIOS)) {
      if (definition.baselinePair !== undefined) expect(baseline, id).toContain(definition.baselinePair);
    }
  });
});
