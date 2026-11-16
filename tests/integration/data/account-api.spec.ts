import { CREDENTIAL_SAFE_EVIDENCE, expect, test } from '@sqaf/fixtures';

/**
 * Stage 3 — Account provisioning against the SUT API (ADR-0009).
 *
 * The ONLY two tests of Stage 3 that create accounts. Each one creates one
 * synthetic account and removes it in the same test run; the fixtures attach
 * the cleanup result (`sqaf-account-cleanup`). Run them sparingly.
 *
 * They handle passwords: no trace and no video (ADR-0009 D16). The
 * credential fixtures refuse to run without this line.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

test('the account client creates, finds and deletes an account', async ({ accountApi, newUserData }) => {
  await test.step('create (API 11)', async () => {
    await accountApi.createAccount(newUserData);
  });

  await test.step('find by e-mail (API 14)', async () => {
    const found = await accountApi.findAccountByEmail(newUserData.email);
    expect(found).toMatchObject({ name: newUserData.name, email: newUserData.email });
  });

  await test.step('delete (API 12) and confirm it no longer exists', async () => {
    expect(await accountApi.deleteAccount(newUserData)).toBe('deleted');
    expect(await accountApi.findAccountByEmail(newUserData.email)).toBeUndefined();
  });
  // The newUserData teardown runs its safety-net deletion and records 'not-found'.
});

test('the testUser fixture provides an existing account that can log in', async ({
  testUser,
  signupLoginPage,
  homePage,
}) => {
  await signupLoginPage.open();
  await signupLoginPage.login(testUser);

  await homePage.waitUntilReady();
  await expect(homePage.header.loggedInUser).toHaveText(`Logged in as ${testUser.name}`);
  // The testUser teardown deletes the account and verifies that API 14 answers 404.
});
