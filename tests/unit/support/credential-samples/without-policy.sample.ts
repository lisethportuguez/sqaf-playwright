import { test } from '@sqaf/fixtures';

/** Credential test WITHOUT the policy: the fixtures must refuse to run before creating any account. */
test('testUser under the general evidence policy', async ({ testUser }) => {
  test.info().annotations.push({ type: 'unreachable', description: testUser.dataId });
});
