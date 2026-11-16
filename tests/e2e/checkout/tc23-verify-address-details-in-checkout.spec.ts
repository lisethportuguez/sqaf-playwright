import {
  CREDENTIAL_SAFE_EVIDENCE,
  expect,
  expectedAddressLines,
  scenario,
  test,
  testData,
} from '@sqaf/fixtures';

/**
 * TC23 — Verify address details in checkout (official test case).
 *
 * The user registers through the UI with the default profile (every address
 * field filled, from users/account-profiles.json). At checkout, the delivery
 * and the billing address must show exactly the registered data, line by
 * line (`expectedAddressLines`). No order is placed. The account is deleted
 * through the UI; the fixture verifies that it no longer exists.
 */
test.use(CREDENTIAL_SAFE_EVIDENCE);

const tc = scenario('TC23');
const products = [testData.products.byId(1), testData.products.byId(2)];

test(tc.title, tc.details, async ({ newUserData, homePage, cartPage, userFlows, checkoutPage, accountDeletedPage }) => {
  test.setTimeout(tc.timeout!);
  const expectedLines = expectedAddressLines(newUserData);

  await test.step('Open the home page and go to Signup / Login', async () => {
    await homePage.open();
    await homePage.header.goToSignupLogin();
  });

  await userFlows.registerViaUi(newUserData);

  await test.step('Add the products to the cart', async () => {
    for (const product of products) {
      await homePage.productGrid.productNamed(product.name).addToCart();
      await expect(homePage.cartModal.confirmationMessage).toBeVisible();
      await homePage.cartModal.continueShopping();
      await expect(homePage.cartModal.root).toBeHidden();
    }
  });

  await test.step('Open the cart and proceed to checkout', async () => {
    await homePage.header.goToCart();
    await cartPage.waitUntilReady();
    await cartPage.proceedToCheckout();
    await checkoutPage.waitUntilReady();
  });

  await test.step('The delivery address is the registered address', async () => {
    await expect(checkoutPage.deliveryAddress.heading).toHaveText('Your delivery address');
    await expect(checkoutPage.deliveryAddress.lines).toHaveText(expectedLines);
  });

  await test.step('The billing address is the registered address', async () => {
    await expect(checkoutPage.billingAddress.heading).toHaveText('Your billing address');
    await expect(checkoutPage.billingAddress.lines).toHaveText(expectedLines);
  });

  await test.step('Delete the account through the UI', async () => {
    await checkoutPage.header.deleteAccount();
    await accountDeletedPage.waitUntilReady();
    await expect(accountDeletedPage.confirmation).toHaveText('Account Deleted!');
    await accountDeletedPage.continue();
  });
});
