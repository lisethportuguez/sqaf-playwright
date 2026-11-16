import { expect, test } from '@sqaf/fixtures';

/**
 * Stage 4 (E4.2) — new Page Object members, OFFLINE: every request is
 * intercepted with page.route() and answered with a reduced copy of the SUT
 * markup observed on 2026-11-16 (classes, ids and texts kept; jQuery handlers
 * replaced by equivalent inline scripts). No request reaches the SUT; the
 * scenarios in tests/e2e/products verify the same members against it.
 */

/** Icon glyphs as the SUT's icon font renders them (CSS content is part of the accessible name). */
const ICONS = `<style>.fa-plus::before{content:"\\f067"} .fa-shopping-cart::before{content:"\\f07a"}</style>`;

const SIDEBAR = `${ICONS}
<div class="left-sidebar"><h2>Category</h2>
  <div class="panel-group category-products" id="accordian">
    <div class="panel panel-default">
      <div class="panel-heading"><h4 class="panel-title"><a data-toggle="collapse" href="#Women"><span class="badge pull-right"><i class="fa fa-plus"></i></span>Women</a></h4></div>
      <div id="Women" class="panel-collapse collapse" style="display:none"><div class="panel-body"><ul>
        <li><a href="/category_products/1">Dress </a></li><li><a href="/category_products/2">Tops </a></li></ul></div></div>
    </div>
    <div class="panel panel-default">
      <div class="panel-heading"><h4 class="panel-title"><a data-toggle="collapse" href="#Kids"><span class="badge pull-right"><i class="fa fa-plus"></i></span>Kids</a></h4></div>
      <div id="Kids" class="panel-collapse collapse" style="display:none"><div class="panel-body"><ul>
        <li><a href="/category_products/4">Dress </a></li></ul></div></div>
    </div>
  </div>
</div>
<script>
  for (const toggle of document.querySelectorAll('[data-toggle="collapse"]')) {
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      document.querySelector(toggle.getAttribute('href')).style.display = 'block';
    });
  }
</script>`;

const card = (name: string, price: number) => `
<div class="product-image-wrapper"><div class="single-products"><div class="productinfo text-center">
  <h2>Rs. ${price}</h2><p>${name}</p><a href="#" class="btn btn-default add-to-cart">Add to cart</a></div></div>
  <div class="choose"><a href="/product_details/1">View Product</a></div></div>`;

const HOME = `<!doctype html><html><head><title>Automation Exercise</title></head><body>
<header><a href="/">Home</a></header>${SIDEBAR}
<div class="features_items"><h2 class="title text-center">Features Items</h2>${card('Blue Top', 500)}${card('Men Tshirt', 400)}</div>
<div class="recommended_items"><h2 class="title text-center">recommended items</h2>${card('Blue Top', 500)}</div>
</body></html>`;

const CATEGORY = `<!doctype html><html><head><title>Automation Exercise - Dress Products</title></head><body>
${SIDEBAR}
<div class="features_items"><h2 class="title text-center">Women - Dress Products</h2>${card('Sleeveless Dress', 1000)}${card('Stylish Dress', 1500)}</div>
</body></html>`;

const DETAILS = `<!doctype html><html><head><title>Automation Exercise - Product Details</title>${ICONS}</head><body>
<div id="cartModal" class="modal fade" style="display:none"><h4>Added!</h4><p>Your product has been added to cart.</p></div>
<div class="product-information"><h2>Blue Top</h2><p>Category: Women &gt; Tops</p>
  <span><span>Rs. 500</span><label>Quantity:</label><input type="number" name="quantity" id="quantity" value="1" min="1" />
  <button type="button" class="btn btn-default cart"><i class="fa fa-shopping-cart"></i> Add to cart</button></span></div>
<script>
  document.querySelector('.cart').addEventListener('click', async () => {
    await fetch('/add_to_cart/1?quantity=' + document.getElementById('quantity').value);
    document.getElementById('cartModal').style.display = 'block';
  });
</script></body></html>`;

const row = (id: number, name: string) => `
<tr id="product-${id}"><td class="cart_description"><h4><a href="/product_details/${id}">${name}</a></h4></td>
<td class="cart_price"><p>Rs. 500</p></td><td class="cart_quantity"><button class="disabled">1</button></td>
<td class="cart_total"><p class="cart_total_price">Rs. 500</p></td>
<td class="cart_delete"><a class="cart_quantity_delete" data-product-id="${id}"><i class="fa fa-times">x</i></a></td></tr>`;
// The "x" stands in for the icon-font glyph, which is not loaded offline (without it the link has no size).

const CART = `<!doctype html><html><head><title>Automation Exercise - Checkout</title></head><body>
<div class="breadcrumbs"><ol><li><a href="/">Home</a></li><li class="active">Shopping Cart</li></ol></div>
<div id="cart_info"><table id="cart_info_table"><tbody>${row(1, 'Blue Top')}${row(2, 'Men Tshirt')}</tbody></table>
<span id="empty_cart" style="display: none;"><p><b>Cart is empty!</b> Click here to buy products.</p></span></div>
<script>
  for (const button of document.querySelectorAll('.cart_quantity_delete')) {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-product-id');
      await fetch('/delete_cart/' + id);
      document.getElementById('product-' + id).remove();
      if (document.querySelectorAll('.cart_quantity_delete').length === 0) {
        document.getElementById('cart_info_table').style.display = 'none';
        document.getElementById('empty_cart').style.display = 'block';
      }
    });
  }
</script></body></html>`;

const PAGES: Readonly<Record<string, string>> = {
  '/': HOME,
  '/category_products/1': CATEGORY,
  '/product_details/1': DETAILS,
  '/view_cart': CART,
};

/** Serves the pages above; records the AJAX calls; aborts anything else. */
async function serveOffline(page: import('@playwright/test').Page): Promise<string[]> {
  const calls: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const body = PAGES[url.pathname];
    if (body !== undefined) {
      await route.fulfill({ contentType: 'text/html', body });
    } else if (/^\/(add_to_cart|delete_cart)\//.test(url.pathname)) {
      calls.push(`${url.pathname}${url.search}`);
      await route.fulfill({ contentType: 'application/json', body: '{}' });
    } else {
      await route.abort('blockedbyclient');
    }
  });
  return calls;
}

test('ProductGrid covers only the grid: the recommended items carousel is left out', async ({ page, homePage }) => {
  await serveOffline(page);
  await homePage.open();

  await expect(homePage.productGrid.cards).toHaveCount(2);
  await expect(homePage.productGrid.productAt(1).name).toHaveText('Men Tshirt');
  await expect(homePage.productGrid.productNamed('Blue Top').root).toHaveCount(1);
  await expect(homePage.productGrid.productNamed('Blue Top').price).toHaveText('Rs. 500');
});

test('CategorySidebar expands a section and opens the category of THAT section', async ({
  page,
  homePage,
  categoryProductsPage,
}) => {
  await serveOffline(page);
  await homePage.open();

  await expect(homePage.categorySidebar.heading).toBeVisible();
  await expect(homePage.categorySidebar.sectionToggle('Women')).toBeVisible();
  // Collapsed sections hide their links.
  await expect(homePage.categorySidebar.categoryLink('Women', 'Dress')).toBeHidden();
  // "Dress" exists in Women and Kids: each link is scoped to its own section.
  await homePage.categorySidebar.sectionToggle('Kids').click();
  await expect(homePage.categorySidebar.categoryLink('Kids', 'Dress')).toHaveAttribute('href', '/category_products/4');
  await expect(homePage.categorySidebar.categoryLink('Women', 'Dress')).toBeHidden();

  await homePage.categorySidebar.openCategory('Women', 'Dress');
  await categoryProductsPage.waitUntilReady();

  await expect(page).toHaveURL(/\/category_products\/1$/);
  // The price headings (h2 "Rs. N") are not taken as the page heading.
  await expect(categoryProductsPage.heading).toHaveText('Women - Dress Products');
  await expect(categoryProductsPage.productGrid.cards).toHaveCount(2);
  await expect(categoryProductsPage.categorySidebar.sectionToggle('Kids')).toBeVisible();
});

test('ProductDetailsPage.addToCart(quantity) sends the quantity and shows the modal', async ({
  page,
  productDetailsPage,
}) => {
  const calls = await serveOffline(page);
  await productDetailsPage.openProduct(1);

  await expect(productDetailsPage.quantityInput).toHaveValue('1');
  await productDetailsPage.addToCart(4);

  await expect(productDetailsPage.cartModal.confirmationMessage).toBeVisible();
  await expect(productDetailsPage.quantityInput).toHaveValue('4');
  expect(calls).toEqual(['/add_to_cart/1?quantity=4']);
});

test('CartPage.removeItem() waits for the row to go, and the last one shows the empty cart', async ({
  page,
  cartPage,
}) => {
  const calls = await serveOffline(page);
  await cartPage.open();
  await expect(cartPage.itemRows).toHaveCount(2);

  await cartPage.removeItem('Blue Top');
  // No extra wait: removeItem() returned only after the row was removed.
  expect(await cartPage.itemRows.count()).toBe(1);
  await expect(cartPage.emptyCartMessage).toBeHidden();

  await cartPage.removeItem('Men Tshirt');
  expect(await cartPage.itemRows.count()).toBe(0);
  await expect(cartPage.emptyCartMessage).toBeVisible();
  expect(calls).toEqual(['/delete_cart/1', '/delete_cart/2']);
});
