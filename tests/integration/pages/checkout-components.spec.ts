import { expect, expectedAddressLines, test, testData } from '@sqaf/fixtures';

/**
 * Stage 4 (E4.3) — checkout Page Objects and `userFlows.payOrder`, OFFLINE:
 * every request is intercepted with page.route() and answered with a
 * reduced copy of the SUT markup observed on 2026-11-16 (the `/checkout`,
 * `/payment` and `/payment_done` templates, classes, ids, data-qa and texts
 * kept; jQuery handlers replaced by equivalent inline scripts). No request
 * reaches the SUT and no account exists. The scenarios in tests/e2e/checkout
 * verify the same members against the SUT.
 */

const PROFILE = testData.accountProfiles.byId('default');
const CARD = testData.paymentCards.byId('test-visa');

const row = (id: number, name: string, price: number) => `
<tr id="product-${id}"><td class="cart_description"><h4><a href="/product_details/${id}">${name}</a></h4></td>
<td class="cart_price"><p>Rs. ${price}</p></td><td class="cart_quantity"><button class="disabled">1</button></td>
<td class="cart_total"><p class="cart_total_price">Rs. ${price}</p></td></tr>`;

const cart = (loggedIn: boolean) => `<!doctype html><html><head><title>Automation Exercise - Checkout</title></head><body>
<div class="breadcrumbs"><ol><li><a href="/">Home</a></li><li class="active">Shopping Cart</li></ol></div>
<a class="btn btn-default check_out">Proceed To Checkout</a>
<div id="checkoutModal" class="modal fade" style="display:none"><h4 class="modal-title w-100">Checkout</h4>
  <p class="text-center">Register / Login account to proceed on checkout.</p>
  <p class="text-center"><a href="/login"><u>Register / Login</u></a></p>
  <button class="btn btn-success close-checkout-modal btn-block">Continue On Cart</button></div>
<table id="cart_info_table"><tbody>${row(1, 'Blue Top', 500)}${row(2, 'Men Tshirt', 400)}</tbody></table>
<script>
  document.querySelector('.check_out').addEventListener('click', () => {
    if (${loggedIn}) window.location = '/checkout';
    else document.getElementById('checkoutModal').style.display = 'block';
  });
</script></body></html>`;

// Same whitespace as the SUT template: the city line breaks before the zipcode.
const address = (id: string, heading: string) => `
<ul class="address item box" id="${id}">
  <li class="address_title"><h3 class="page-subheading">${heading}</h3></li>
  <li class="address_firstname address_lastname">${PROFILE.title}. ${PROFILE.firstName} ${PROFILE.lastName}</li>
  <li class="address_address1 address_address2">${PROFILE.company}</li>
  <li class="address_address1 address_address2">${PROFILE.address}</li>
  <li class="address_address1 address_address2">${PROFILE.address2}</li>
  <li class="address_city address_state_name address_postcode">${PROFILE.city} ${PROFILE.state}
      ${PROFILE.zipcode}</li>
  <li class="address_country_name">${PROFILE.country}</li>
  <li class="address_phone">${PROFILE.mobileNumber}</li>
</ul>`;

const CHECKOUT = `<!doctype html><html><head><title>Automation Exercise - Checkout</title></head><body>
<header><a href="/">Home</a></header>
<div class="step-one"><h2 class="heading">Address Details</h2></div>
<div class="checkout-information" data-qa="checkout-info">
  ${address('address_delivery', 'Your delivery address')}${address('address_invoice', 'Your billing address')}</div>
<div class="step-one"><h2 class="heading">Review Your Order</h2></div>
<div class="table-responsive cart_info" id="cart_info"><table class="table table-condensed"><tbody>
  ${row(1, 'Blue Top', 500)}${row(2, 'Men Tshirt', 400)}
  <tr><td></td><td></td><td colspan="2"><h4><b>Total Amount</b></h4></td><td><p class="cart_total_price">Rs. 900</p></td></tr>
</tbody></table></div>
<div id="ordermsg" class="form-group">
  <label>If you would like to add a comment about your order, please write it in the field below.</label>
  <textarea class="form-control" cols="60" rows="6" name="message"></textarea></div>
<div><a href="/payment" class="btn btn-default check_out">Place Order</a></div>
</body></html>`;

const PAYMENT = `<!doctype html><html><head><title>Automation Exercise - Payment</title></head><body>
<h2 class="heading">Payment</h2>
<form action="/payment" id="payment-form" method="POST">
  <input class="form-control" name="name_on_card" data-qa="name-on-card" required type="text">
  <input name="card_number" data-qa="card-number" class="form-control card-number" required type="text">
  <input name="cvc" data-qa="cvc" class="form-control card-cvc" required placeholder="ex. 311" type="text">
  <input class="form-control card-expiry-month" name="expiry_month" data-qa="expiry-month" required placeholder="MM" type="text">
  <input name="expiry_year" data-qa="expiry-year" class="form-control card-expiry-year" required placeholder="YYYY" type="text">
  <div class="hide" id="success_message" style="display:none"><div class="alert-success alert">Your order has been placed successfully!</div></div>
  <button class="form-control btn btn-primary submit-button" data-qa="pay-button" id="submit" type="submit">Pay and Confirm Order</button>
</form>
<script>document.getElementById('payment-form').addEventListener('submit', () => {
  document.getElementById('success_message').style.display = 'block';
});</script></body></html>`;

const ORDER_PLACED = `<!doctype html><html><head><title>Automation Exercise - Order Placed</title></head><body>
<h2 class="title text-center" data-qa="order-placed"><b>Order Placed!</b></h2>
<p>Congratulations! Your order has been confirmed!</p>
<a href="/download_invoice/900" class="btn btn-default check_out">Download Invoice</a>
<div class="pull-right"><a href="/" data-qa="continue-button" class="btn btn-primary">Continue</a></div>
</body></html>`;

const LOGIN = `<!doctype html><html><head><title>Automation Exercise - Signup / Login</title></head><body>
<h2>Login to your account</h2><h2>New User Signup!</h2></body></html>`;

interface Offline {
  readonly payments: URLSearchParams[];
}

async function serveOffline(page: import('@playwright/test').Page, loggedIn: boolean): Promise<Offline> {
  const payments: URLSearchParams[] = [];
  const pages: Readonly<Record<string, string>> = {
    '/view_cart': cart(loggedIn),
    '/checkout': CHECKOUT,
    '/payment': PAYMENT,
    '/payment_done/900': ORDER_PLACED,
    '/login': LOGIN,
  };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/payment' && request.method() === 'POST') {
      payments.push(new URLSearchParams(request.postData() ?? ''));
      await route.fulfill({ status: 302, headers: { location: '/payment_done/900' } });
    } else if (pages[url.pathname] !== undefined) {
      await route.fulfill({ contentType: 'text/html', body: pages[url.pathname]! });
    } else {
      await route.abort('blockedbyclient');
    }
  });
  return { payments };
}

test('without a user, proceedToCheckout() shows the CheckoutModal, whose link goes to Signup / Login', async ({
  page,
  cartPage,
  signupLoginPage,
}) => {
  await serveOffline(page, false);
  await cartPage.open();

  await expect(cartPage.checkoutModal.message).toBeHidden();
  await cartPage.proceedToCheckout();
  await expect(cartPage.checkoutModal.title).toBeVisible();
  await expect(cartPage.checkoutModal.message).toBeVisible();
  await expect(cartPage.checkoutModal.continueOnCartButton).toBeVisible();

  await cartPage.checkoutModal.goToRegisterLogin();
  await signupLoginPage.waitUntilReady();
  await expect(page).toHaveURL(/\/login$/);
});

test('with a user, proceedToCheckout() opens the CheckoutPage: addresses, review rows and total', async ({
  page,
  cartPage,
  checkoutPage,
}) => {
  await serveOffline(page, true);
  await cartPage.open();
  await cartPage.proceedToCheckout();
  await checkoutPage.waitUntilReady();

  // AddressBlock: the heading item is excluded; the lines match expectedAddressLines() despite the line break.
  await expect(checkoutPage.deliveryAddress.heading).toHaveText('Your delivery address');
  await expect(checkoutPage.deliveryAddress.lines).toHaveCount(7);
  await expect(checkoutPage.deliveryAddress.lines).toHaveText(expectedAddressLines(PROFILE));
  await expect(checkoutPage.billingAddress.heading).toHaveText('Your billing address');
  await expect(checkoutPage.billingAddress.lines).toHaveText(expectedAddressLines(PROFILE));

  // CartTable reused for the review: the "Total Amount" row is not a product row.
  await expect(checkoutPage.orderItems.rows).toHaveCount(2);
  await expect(checkoutPage.orderItems.itemNamed('Men Tshirt').total).toHaveText('Rs. 400');
  await expect(checkoutPage.orderItems.itemAt(0).name).toHaveText('Blue Top');
  await expect(checkoutPage.totalAmount).toHaveText('Rs. 900');

  await checkoutPage.placeOrder('offline comment');
  await expect(page).toHaveURL(/\/payment$/);
});

test('userFlows.payOrder(card) submits every card field and ends on the OrderPlacedPage', async ({
  page,
  paymentPage,
  userFlows,
  orderPlacedPage,
}) => {
  const offline = await serveOffline(page, true);
  await paymentPage.open();

  await userFlows.payOrder(CARD);

  await expect(page).toHaveURL(/\/payment_done\/900$/);
  await expect(orderPlacedPage.downloadInvoiceLink).toBeVisible();
  expect(offline.payments).toHaveLength(1);
  const form = offline.payments[0]!;
  // fillSecret writes the number and the CVC without step titles, but the form still submits them.
  expect({
    nameOnCard: form.get('name_on_card'),
    cardNumber: form.get('card_number'),
    cvc: form.get('cvc'),
    expiryMonth: form.get('expiry_month'),
    expiryYear: form.get('expiry_year'),
  }).toEqual({
    nameOnCard: CARD.nameOnCard,
    cardNumber: CARD.cardNumber,
    cvc: CARD.cvc,
    expiryMonth: CARD.expiryMonth,
    expiryYear: CARD.expiryYear,
  });
});
