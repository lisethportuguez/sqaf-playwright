/**
 * SQAF — Page Object layer entry point (Stage 2).
 *
 * Imported by the Fixtures layer only: the test suites receive Page Objects
 * through fixtures and never import this module (checked by
 * tests/unit/architecture/dependency-rule.spec.ts).
 */
export { BasePage } from './base.page';
export { HeaderComponent } from './components/header.component';
export { ProductCard } from './components/product-card.component';
export { CartModal } from './components/cart-modal.component';
export { CategorySidebar, type SidebarSection } from './components/category-sidebar.component';
export { ProductGrid } from './components/product-grid.component';
export { CategoryProductsPage } from './category-products.page';
export { HomePage } from './home.page';
export { SignupLoginPage, type LoginCredentials, type SignupIdentity } from './signup-login.page';
export { AccountInformationPage, type AccountDetails } from './account-information.page';
export { AccountCreatedPage } from './account-created.page';
export { AccountDeletedPage } from './account-deleted.page';
export { ProductsPage } from './products.page';
export { ProductDetailsPage } from './product-details.page';
export { CartPage, type CartItem } from './cart.page';
export { CartTable } from './components/cart-table.component';
export { CheckoutModal } from './components/checkout-modal.component';
export { AddressBlock } from './components/address-block.component';
export { CheckoutPage } from './checkout.page';
export { PaymentPage, type PaymentDetails } from './payment.page';
export { OrderPlacedPage } from './order-placed.page';
