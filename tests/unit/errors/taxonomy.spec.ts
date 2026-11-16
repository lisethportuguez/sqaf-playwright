import { expect, test } from '@playwright/test';
import {
  ApiError,
  classifyFailure,
  DataValidationError,
  emptyClassificationCounts,
  FAILURE_CLASSIFICATIONS,
  InfrastructureError,
  pageSnapshotSection,
} from '../../../src/errors';

/**
 * Stage 5 — full failure taxonomy (ADR-0008). Messages reproduce the format
 * Playwright 1.65 prints for each kind of failure. Stage 1 anti-bot cases and
 * their negative cases live in failure-classification.spec.ts, unchanged.
 */

const LOCATOR_ACTION_TIMEOUT = [
  'Error: locator.click: Timeout 10000ms exceeded.',
  'Call log:',
  "  - waiting for getByRole('link', { name: /^\\W*Products$/ })",
].join('\n');

const TEST_TIMEOUT_DURING_ACTION = [
  'Error: locator.fill: Test timeout of 30000ms exceeded.',
  'Call log:',
  "  - waiting for locator('[data-qa=\"login-email\"]')",
].join('\n');

const NAVIGATION_NETWORK_ERROR = [
  'Error: page.goto: net::ERR_NAME_NOT_RESOLVED at https://automationexercise.com/',
  'Call log:',
  '  - navigating to "https://automationexercise.com/", waiting until "load"',
].join('\n');

const BAD_GATEWAY_TITLE = [
  'Error: expect(page).toHaveTitle(expected) failed',
  '',
  'Expected: "Automation Exercise"',
  'Received: "automationexercise.com | 502: Bad gateway"',
].join('\n');

const VALUE_ASSERTION = [
  'Error: expect(received).toBe(expected) // Object.is equality',
  '',
  'Expected: 3',
  'Received: 2',
].join('\n');

test.describe('each classification of the taxonomy', () => {
  test('infrastructure/network: a Chromium net:: error', () => {
    expect(classifyFailure({ errorMessages: [NAVIGATION_NETWORK_ERROR] })).toEqual({
      classification: 'infrastructure/network',
      evidence: ['network error net::ERR_NAME_NOT_RESOLVED'],
    });
  });

  test('infrastructure/network: a Node.js socket error of an API request', () => {
    const result = classifyFailure({
      errorMessages: ['Error: apiRequestContext.fetch: connect ECONNREFUSED 104.21.0.1:443'],
    });
    expect(result).toEqual({ classification: 'infrastructure/network', evidence: ['network error ECONNREFUSED'] });
  });

  test('infrastructure/network: the Windows DNS failure observed in Stage 3 (raw Playwright message)', () => {
    const result = classifyFailure({
      errorMessages: ['Error: apiRequestContext.fetch: getaddrinfo ENOENT automationexercise.com'],
    });
    expect(result).toEqual({ classification: 'infrastructure/network', evidence: ['network error getaddrinfo ENOENT'] });
  });

  test('net::ERR_BLOCKED_BY_CLIENT is the ad-blocking policy, not a network failure', () => {
    const result = classifyFailure({ errorMessages: ['Error: net::ERR_BLOCKED_BY_CLIENT at https://pagead2.googlesyndication.com/'] });
    expect(result.classification).toBe('unclassified');
  });

  test('infrastructure/sut-unavailable: a 5xx error page title', () => {
    expect(classifyFailure({ errorMessages: [BAD_GATEWAY_TITLE] })).toEqual({
      classification: 'infrastructure/sut-unavailable',
      evidence: ['server error 502 Bad gateway'],
    });
  });

  test('infrastructure/sut-unavailable: a Cloudflare 52x page in the page snapshot', () => {
    const result = classifyFailure({
      errorMessages: ['Test timeout of 30000ms exceeded.'],
      pageSnapshot: '- heading "Web server is down" [level=1]\n- text: Error code 521 Web server is down',
    });
    expect(result.classification).toBe('infrastructure/sut-unavailable');
  });

  test('automation/locator-timeout: an action timed out waiting for a locator', () => {
    for (const message of [LOCATOR_ACTION_TIMEOUT, TEST_TIMEOUT_DURING_ACTION]) {
      const result = classifyFailure({ errorMessages: [message] });
      expect(result.classification, message).toBe('automation/locator-timeout');
      expect(result.evidence[0]).toContain('while waiting for a locator');
    }
  });

  test('assertion/mismatch: web-first and value assertions', () => {
    expect(classifyFailure({ errorMessages: [VALUE_ASSERTION] })).toEqual({
      classification: 'assertion/mismatch',
      evidence: ['failed assertion expect(received).toBe(…)'],
    });
    const negated = classifyFailure({ errorMessages: ['Error: expect(locator).not.toBeVisible() failed'] });
    expect(negated.classification).toBe('assertion/mismatch');
  });

  test('test-data/invalid and api/request-failed: SQAF errors classify themselves', () => {
    const data = new DataValidationError({ source: 'users/x.json', issues: ['$[0].email: expected an e-mail'] });
    const api = new ApiError({ operation: 'createAccount', method: 'POST', endpoint: '/api/createAccount', summary: 's', responseCode: 400 });
    expect(classifyFailure({ errorMessages: [`DataValidationError: ${data.message}`] }).classification).toBe('test-data/invalid');
    expect(classifyFailure({ errorMessages: [`ApiError: ${api.message}`] })).toEqual({
      classification: 'api/request-failed',
      evidence: ['error raised as [SQAF:api/request-failed]'],
    });
  });

  test('infrastructure errors raised by SQAF keep their own classification', () => {
    const error = new InfrastructureError({ classification: 'infrastructure/sut-unavailable', summary: 's', evidence: ['HTTP 503'] });
    expect(classifyFailure({ errorMessages: [error.message] }).classification).toBe('infrastructure/sut-unavailable');
  });
});

test.describe('priority between rules', () => {
  test('the anti-bot rule (Stage 1) wins over every other rule', () => {
    const result = classifyFailure({
      errorMessages: [`${LOCATOR_ACTION_TIMEOUT}\nReceived: "One moment, please..."`],
    });
    expect(result.classification).toBe('infrastructure/anti-bot-challenge');
  });

  test('an SQAF marker wins over the heuristics', () => {
    const api = new ApiError({ operation: 'op', method: 'GET', endpoint: '/api/x', summary: 'net::ERR_FAILED mentioned' });
    expect(classifyFailure({ errorMessages: [api.message] }).classification).toBe('api/request-failed');
  });

  test('infrastructure wins over an assertion that failed because of it', () => {
    expect(classifyFailure({ errorMessages: [BAD_GATEWAY_TITLE] }).classification).toBe('infrastructure/sut-unavailable');
  });

  test('a locator timeout outranks a later failed assertion message', () => {
    expect(classifyFailure({ errorMessages: [LOCATOR_ACTION_TIMEOUT, VALUE_ASSERTION] }).classification).toBe(
      'automation/locator-timeout',
    );
  });
});

test.describe('no false positives of the new rules', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['an unknown SQAF-like marker', '[SQAF:made-up/reason] something'],
    ['a price that looks like a status code', 'Expected: "Rs. 500"\nReceived: "Rs. 502"'],
    ['a test timeout without a locator', 'Test timeout of 30000ms exceeded.'],
    ['a page.goto timeout (no locator involved)', 'Error: page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating to "/"'],
    ['the word "expect" in prose', 'We expect (eventually) the cart to update'],
  ];
  for (const [label, message] of cases) {
    test(label, () => {
      expect(classifyFailure({ errorMessages: [message] })).toEqual({ classification: 'unclassified', evidence: [] });
    });
  }
});

test('the report counts list every classification exactly once, in order', () => {
  expect(FAILURE_CLASSIFICATIONS).toEqual([
    'infrastructure/anti-bot-challenge',
    'infrastructure/network',
    'infrastructure/sut-unavailable',
    'test-data/invalid',
    'api/request-failed',
    'automation/locator-timeout',
    'assertion/mismatch',
    'unclassified',
  ]);
  expect(Object.keys(emptyClassificationCounts())).toEqual([...FAILURE_CLASSIFICATIONS]);
  expect(Object.values(emptyClassificationCounts()).every((count) => count === 0)).toBe(true);
});

test.describe('error-context: only the page snapshot is page text', () => {
  const document = (sections: Record<string, string>): string =>
    Object.entries(sections)
      .map(([title, body]) => `# ${title}\n\n${body}\n`)
      .join('\n');

  test('extracts the "# Page snapshot" section of the Markdown attachment', () => {
    const context = document({
      'Test info': '- Name: x',
      'Error details': '```\nError: boom\n```',
      'Page snapshot': '```yaml\n- heading "Automation Exercise"\n```',
      'Test source': '```ts\nconst page = "Please wait while your request is being verified";\n```',
    });
    expect(pageSnapshotSection(context)).toBe('```yaml\n- heading "Automation Exercise"\n```');
  });

  test('the TEST SOURCE section never produces a classification (Stage 5 fix)', () => {
    const context = document({
      'Error details': '```\nError: boom\n```',
      'Test source': '```ts\nconst a = "Please wait while your request is being verified";\nconst b = "502: Bad gateway";\n```',
    });
    expect(pageSnapshotSection(context)).toBeUndefined();
    const snapshot = pageSnapshotSection(context);
    expect(classifyFailure({ errorMessages: ['Error: boom'], ...(snapshot ? { pageSnapshot: snapshot } : {}) }).classification).toBe(
      'unclassified',
    );
  });

  test('a raw snapshot without sections is used as is (Stage 1 behaviour)', () => {
    expect(pageSnapshotSection('- text: Please wait')).toBe('- text: Please wait');
  });
});

/*
 * Stage 5 adjustment — REAL error-context attachments of Playwright 1.65
 * (captured 2026-11-15 with a local fake server, see E5 §3.6). When an
 * `expect` on a locator fails, the page snapshot is a ```yaml block INSIDE
 * `# Error details`; there is no `# Page snapshot` section. Classified
 * exactly as the reporter does: messages + pageSnapshotSection().
 */
test.describe('real Playwright 1.65 error-context attachments', () => {
  const attachment = (message: string, yaml: string): string =>
    [
      '# Instructions',
      '',
      '- Following Playwright test failed.',
      '',
      '# Test info',
      '',
      '- Name: classify.spec.ts >> sample',
      '- Location: classify.spec.ts:9:1',
      '',
      '# Error details',
      '',
      '```',
      message,
      '```',
      '',
      '```yaml',
      yaml,
      '```',
      '',
      '# Test source',
      '',
      '```ts',
      "  1 | const unrelated = 'Please wait while your request is being verified... 502: Bad gateway';",
      '```',
    ].join('\n');

  const classify = (message: string, yaml: string) =>
    classifyFailure({ errorMessages: [message], pageSnapshot: pageSnapshotSection(attachment(message, yaml))! });

  const NOT_VISIBLE = (locator: string): string =>
    [
      'Error: expect(locator).toBeVisible() failed',
      '',
      `Locator: ${locator}`,
      'Expected: visible',
      'Timeout: 2000ms',
      'Error: element(s) not found',
      '',
      'Call log:',
      `  - Expect "toBeVisible" ${locator} with timeout 2000ms`,
      `  - waiting for ${locator}`,
    ].join('\n');

  test('the matcher snapshot inside "# Error details" is extracted, the test source is not', () => {
    const snapshot = pageSnapshotSection(attachment('Error: boom', '- paragraph: OK'));
    expect(snapshot).toBe('```yaml\n- paragraph: OK\n```');
  });

  test('C1: assertion failed on a Cloudflare 502 page → infrastructure/sut-unavailable', () => {
    const result = classify(
      NOT_VISIBLE("getByRole('heading', { name: 'Automation Exercise' })"),
      '- heading "Bad gateway" [level=1]\n- text: Error code 502\n- paragraph: "502: Bad gateway"',
    );
    expect(result).toEqual({ classification: 'infrastructure/sut-unavailable', evidence: ['server error 502 Bad gateway'] });
  });

  test('C4b: locator assertion on the challenge page → anti-bot (Stage 1 behaviour restored)', () => {
    const result = classify(
      NOT_VISIBLE("getByRole('link', { name: 'Products' })"),
      '- heading "Please wait while your request is being verified..." [level=1]',
    );
    expect(result.classification).toBe('infrastructure/anti-bot-challenge');
  });

  test('C5b: the EXPECTED text is "502 Bad Gateway" but the SUT answered → assertion/mismatch', () => {
    const message = [
      'Error: expect(locator).toHaveText(expected) failed',
      '',
      "Locator:  getByTestId('status')",
      'Expected: "502 Bad Gateway"',
      'Received: "OK"',
      'Timeout:  2000ms',
      '',
      'Call log:',
      "  - Expect \"toHaveText\" getByTestId('status') with timeout 2000ms",
      "  - waiting for getByTestId('status')",
      '    19 × locator resolved to <p data-qa="status">OK</p>',
      '       - unexpected value "OK"',
    ].join('\n');
    expect(classify(message, '- paragraph: OK')).toEqual({
      classification: 'assertion/mismatch',
      evidence: ['failed assertion expect(locator).toHaveText(…)'],
    });
  });

  test('C5: a price containing 502 on a 200 page → assertion/mismatch', () => {
    const message = [
      'Error: expect(locator).toHaveText(expected) failed',
      '',
      "Locator:  getByTestId('total')",
      'Expected: "Rs. 500"',
      'Received: "Rs. 502"',
    ].join('\n');
    expect(classify(message, '- paragraph: Rs. 502').classification).toBe('assertion/mismatch');
  });

  test('what the SUT RETURNED still counts: a received 502 title is infrastructure', () => {
    expect(classifyFailure({ errorMessages: [BAD_GATEWAY_TITLE] }).classification).toBe('infrastructure/sut-unavailable');
  });
});
