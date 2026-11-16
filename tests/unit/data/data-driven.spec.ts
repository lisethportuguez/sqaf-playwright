import { expect, test } from '@playwright/test';
import { buildUserAccount, caseTitle, testData } from '../../../src/data';
import { runPlaywright } from '../support/run-playwright';

/**
 * Stage 3 — Data-Driven Testing (ADR-0009), offline.
 *
 * DDT in SQAF uses Playwright's own mechanism: a loop over a provider at
 * collection time generates ONE test per case, titled `<base> [<case id>]`.
 * The same body runs with every case, so no scenario logic is duplicated.
 */

// DDT over the user profiles (no SUT): every profile produces a valid, compatible user.
for (const profile of testData.accountProfiles.all()) {
  test(caseTitle('a user built from the profile is complete and synthetic', profile), () => {
    const user = buildUserAccount({ dataId: `user-ddt-${profile.id}`, password: 'p' }, {}, profile);
    expect(user.profileId).toBe(profile.id);
    expect(user.email).toBe(`sqaf.user-ddt-${profile.id}@example.com`);
    expect(user.name).toBe(profile.name);
  });
}

// DDT over the negative login cases: the data itself guarantees the case stays negative.
for (const credentials of testData.invalidCredentials.all()) {
  test(caseTitle('an invalid-credentials case uses a reserved, never-registered address', credentials), () => {
    expect(credentials.email).not.toMatch(/^sqaf\.user-/); // never collides with factory users
    expect(credentials.expectedError).toBe('Your email or password is incorrect!');
  });
}

test('the integration suite generates one test per dataset case (listed, not executed)', () => {
  const run = runPlaywright(['test', '--project=integration', '--list', 'tests/integration/data/data-driven.spec.ts']);
  expect(run.status, run.stderr).toBe(0);
  const listed = run.stdout.split('\n').filter((line) => line.includes('data-driven.spec.ts'));

  const expected = [
    ...testData.invalidCredentials.all().map((c) => caseTitle('rejects an invalid login', c)),
    ...testData.productSearches.all().map((c) => caseTitle('search returns exactly the expected products', c)),
  ];
  for (const title of expected) {
    expect(listed.filter((line) => line.includes(title)), title).toHaveLength(1);
  }
  expect(listed).toHaveLength(expected.length);
});
