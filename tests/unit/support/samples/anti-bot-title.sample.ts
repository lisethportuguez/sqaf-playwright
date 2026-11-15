import { expect, test } from '@playwright/test';

// Reproduces, without contacting the SUT, the assertion failure observed in
// CI runs 43690859628 (attempt 1) and 43691579360: the page title was the
// Cloudflare challenge title instead of "Automation Exercise".
test('simulated baseline assertion on the challenge page', () => {
  const receivedTitle = 'One moment, please...';
  expect(receivedTitle).toBe('Automation Exercise');
});
