import { test } from '@playwright/test';
import { assertNoAntiBotChallenge } from '../../../../src/errors/anti-bot-guard';
import type { PageLike } from '../../../../src/utils/anti-bot-detector';

// A fake page that looks exactly like the observed challenge page.
const challengePage = {
  title: async () => 'One moment, please...',
  url: () => 'https://automationexercise.com/',
  evaluate: async () => 'Please wait while your request is being verified...',
} as unknown as PageLike;

test('SQAF guard raises InfrastructureError on the challenge page', async () => {
  await assertNoAntiBotChallenge(challengePage);
});
