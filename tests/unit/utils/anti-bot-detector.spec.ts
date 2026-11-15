import { expect, test } from '@playwright/test';
import {
  detectAntiBotChallenge,
  normalizeText,
  readPageSignature,
  type PageLike,
} from '../../../src/utils/anti-bot-detector';

/** Text of the observed challenge page (error-context of CI run 43690859628, attempt 1). */
const CHALLENGE = {
  title: 'One moment, please...',
  bodyText: 'Please wait while your request is being verified...',
};

/** Abridged text of the real Automation Exercise home page. */
const SUT_HOME = {
  title: 'Automation Exercise',
  bodyText:
    'Home Products Cart Signup / Login Test Cases API Testing Video Tutorials Contact us ' +
    'AutomationExercise Full-Fledged practice website for Automation Engineers ' +
    'All QA engineers can use this website for automation practice and API testing. ' +
    'Category Women Men Kids Brands Features Items Add to cart View Product',
};

test.describe('positive detection', () => {
  test('detects the observed challenge page (title and body)', () => {
    const detection = detectAntiBotChallenge(CHALLENGE);
    expect(detection.detected).toBe(true);
    expect(detection.matched).toEqual([
      'title is "One moment, please..."',
      'body contains "Please wait while your request is being verified"',
    ]);
  });

  test('detects by title alone', () => {
    expect(detectAntiBotChallenge({ title: 'One moment, please...', bodyText: '' }).detected).toBe(true);
  });

  test('detects by body alone (title not yet set)', () => {
    expect(detectAntiBotChallenge({ title: '', bodyText: CHALLENGE.bodyText }).detected).toBe(true);
  });

  test('tolerates whitespace, line breaks, case and the Unicode ellipsis', () => {
    expect(detectAntiBotChallenge({ title: '  One moment,\n please… ', bodyText: '' }).detected).toBe(true);
    expect(
      detectAntiBotChallenge({ title: '', bodyText: 'PLEASE WAIT while your\n\trequest is being   verified' }).detected,
    ).toBe(true);
  });
});

test.describe('negative detection', () => {
  test('a normal SUT page is not a challenge', () => {
    expect(detectAntiBotChallenge(SUT_HOME)).toEqual({ detected: false, matched: [] });
  });

  test('other SUT titles are not a challenge', () => {
    for (const title of ['Automation Exercise - All Products', 'Automation Exercise - Signup / Login', '']) {
      expect(detectAntiBotChallenge({ title, bodyText: '' }).detected).toBe(false);
    }
  });
});

test.describe('partial matches are not enough', () => {
  const titles = [
    'One moment',
    'One moment, please',
    'one moment, please...',
    'One moment, please... | Automation Exercise',
    'Automation Exercise - One moment, please...',
  ];
  for (const title of titles) {
    test(`title "${title}" is not a challenge`, () => {
      expect(detectAntiBotChallenge({ title, bodyText: '' }).detected).toBe(false);
    });
  }

  const bodies = ['Please wait', 'your request is being verified', 'Please wait while your request', 'request verified'];
  for (const bodyText of bodies) {
    test(`body "${bodyText}" is not a challenge`, () => {
      expect(detectAntiBotChallenge({ title: 'Automation Exercise', bodyText }).detected).toBe(false);
    });
  }
});

test('normalizeText strips ANSI colours and collapses whitespace', () => {
  expect(normalizeText('\u001b[31mReceived:\u001b[39m  "One moment, please…"\n')).toBe(
    'Received: "One moment, please..."',
  );
});

test('readPageSignature reads title, body text and URL from a page', async () => {
  const page = {
    title: async () => 'One moment, please...',
    url: () => 'https://automationexercise.com/',
    evaluate: async () => 'Please wait while your request is being verified...',
  } as unknown as PageLike;
  expect(await readPageSignature(page)).toEqual({
    title: 'One moment, please...',
    bodyText: 'Please wait while your request is being verified...',
    url: 'https://automationexercise.com/',
  });
});
