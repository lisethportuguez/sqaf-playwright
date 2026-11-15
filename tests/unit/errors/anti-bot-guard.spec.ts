import { expect, test } from '@playwright/test';
import { assertNoAntiBotChallenge } from '../../../src/errors/anti-bot-guard';
import { INFRASTRUCTURE_ANTI_BOT, InfrastructureError } from '../../../src/errors/infrastructure-error';
import type { PageLike } from '../../../src/utils/anti-bot-detector';

function fakePage(title: string, bodyText: string): PageLike {
  return {
    title: async () => title,
    url: () => 'https://automationexercise.com/',
    evaluate: async () => bodyText,
  } as unknown as PageLike;
}

test('throws InfrastructureError (infrastructure/anti-bot-challenge) on the challenge page', async () => {
  const error = await assertNoAntiBotChallenge(
    fakePage('One moment, please...', 'Please wait while your request is being verified...'),
  ).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );

  expect(error).toBeInstanceOf(InfrastructureError);
  const infra = error as InfrastructureError;
  expect(infra.name).toBe('InfrastructureError');
  expect(infra.category).toBe('infrastructure');
  expect(infra.classification).toBe(INFRASTRUCTURE_ANTI_BOT);
  expect(infra.url).toBe('https://automationexercise.com/');
  expect(infra.evidence).toHaveLength(2);
  expect(infra.message.startsWith('[SQAF:infrastructure/anti-bot-challenge] ')).toBe(true);
  expect(infra.message).toContain('URL: https://automationexercise.com/');
  expect(infra.message).toContain('the test is reported as FAILED');
});

test('resolves on a normal SUT page', async () => {
  await expect(
    assertNoAntiBotChallenge(fakePage('Automation Exercise', 'Full-Fledged practice website for Automation Engineers')),
  ).resolves.toBeUndefined();
});

test('InfrastructureError evidence is immutable', () => {
  const error = new InfrastructureError({
    classification: INFRASTRUCTURE_ANTI_BOT,
    summary: 'summary',
    evidence: ['a'],
  });
  expect(Object.isFrozen(error.evidence)).toBe(true);
  expect(error.url).toBeUndefined();
  expect(error.message).not.toContain('URL:');
});
