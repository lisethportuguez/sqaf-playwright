import { expect, test } from '@playwright/test';
import { classifyFailure } from '../../../src/errors/failure-classification';

/** Message printed by Playwright in CI run 43690859628, attempt 1 (TC3). */
const OBSERVED_CHALLENGE_MESSAGE = [
  'Error: expect(page).toHaveTitle(expected) failed',
  '',
  'Expected: "Automation Exercise"',
  'Received: "One moment, please..."',
  'Timeout:  5000ms',
].join('\n');

/** Automation failure of Stage 0 series 1 (TC9 clicked before the page load). */
const STAGE0_AUTOMATION_FAILURE = [
  'Error: expect(locator).toBeVisible() failed',
  '',
  "Locator: getByRole('heading', { name: 'Searched Products' })",
  'Expected: visible',
  'Timeout: 5000ms',
  'Error: element(s) not found',
].join('\n');

test.describe('classified as infrastructure/anti-bot-challenge', () => {
  test('the assertion message observed in CI', () => {
    expect(classifyFailure({ errorMessages: [OBSERVED_CHALLENGE_MESSAGE] })).toEqual({
      classification: 'infrastructure/anti-bot-challenge',
      evidence: ['received title "One moment, please..."'],
    });
  });

  test('the same message with ANSI colour codes', () => {
    const coloured = OBSERVED_CHALLENGE_MESSAGE.replace(
      'Received: "One moment, please..."',
      'Received: \u001b[31m"One moment, please..."\u001b[39m',
    );
    expect(classifyFailure({ errorMessages: [coloured] }).classification).toBe('infrastructure/anti-bot-challenge');
  });

  test('a generic failure whose page snapshot shows the challenge text', () => {
    const result = classifyFailure({
      errorMessages: ['Test timeout of 30000ms exceeded.'],
      pageSnapshot: '```yaml\n- text: Please wait while your request is being verified...\n```',
    });
    expect(result).toEqual({
      classification: 'infrastructure/anti-bot-challenge',
      evidence: ['page text "Please wait while your request is being verified"'],
    });
  });

  test('an InfrastructureError raised by the SQAF guard', () => {
    const result = classifyFailure({
      errorMessages: ['InfrastructureError: [SQAF:infrastructure/anti-bot-challenge] The System Under Test answered...'],
    });
    expect(result.classification).toBe('infrastructure/anti-bot-challenge');
    expect(result.evidence).toContain('error raised as [SQAF:infrastructure/anti-bot-challenge]');
  });
});

test.describe('left unclassified (no false positives)', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['an ordinary assertion failure', 'Expected: 3\nReceived: 2'],
    ['a received title that only contains the challenge title', 'Received: "One moment, please... | Shop"'],
    ['the challenge title without quotes', 'Product "One moment" not found. One moment, please... retrying'],
    ['a fragment of the challenge sentence', 'Please wait while the cart is updated'],
  ];
  for (const [label, message] of cases) {
    test(label, () => {
      expect(classifyFailure({ errorMessages: [message] })).toEqual({ classification: 'unclassified', evidence: [] });
    });
  }

  test('a failure without any message', () => {
    expect(classifyFailure({ errorMessages: [] }).classification).toBe('unclassified');
  });
});

/*
 * Stage 5 (ADR-0008): until Stage 4 this case was `unclassified` because the
 * taxonomy only knew the anti-bot challenge. It is still NOT an
 * infrastructure failure (the Stage 1 guarantee); with the full taxonomy it
 * is a failed assertion.
 */
test('the Stage 0 automation failure (TC9) is not infrastructure: it is assertion/mismatch', () => {
  const result = classifyFailure({ errorMessages: [STAGE0_AUTOMATION_FAILURE] });
  expect(result.classification).not.toMatch(/^infrastructure\//);
  expect(result).toEqual({
    classification: 'assertion/mismatch',
    evidence: ['failed assertion expect(locator).toBeVisible(…)'],
  });
});
