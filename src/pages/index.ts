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
export { HomePage } from './home.page';
export { SignupLoginPage, type LoginCredentials, type SignupIdentity } from './signup-login.page';
export { AccountInformationPage, type AccountDetails } from './account-information.page';
export { AccountCreatedPage } from './account-created.page';
export { AccountDeletedPage } from './account-deleted.page';
export { ProductsPage } from './products.page';
export { ProductDetailsPage } from './product-details.page';
export { CartPage, type CartItem } from './cart.page';
