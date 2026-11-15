import { expect, test } from '@playwright/test';

test('ordinary assertion failure', () => {
  expect(2).toBe(3);
});
