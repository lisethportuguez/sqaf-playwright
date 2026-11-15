import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SQAF — "Account Deleted!" confirmation. Reached only through
 * HeaderComponent.deleteAccount(); it is deliberately NOT openable directly:
 * a GET on its URL deletes the account of the current session. `data-qa`
 * locators observed in Stage 0 (TC1). Not exercised in Stage 2 (D8).
 */
export class AccountDeletedPage extends BasePage {
  protected readonly path = undefined;

  readonly confirmation: Locator;
  readonly continueButton: Locator;

  constructor(page: AccountDeletedPage['page']) {
    super(page);
    this.confirmation = page.getByTestId('account-deleted');
    this.continueButton = page.getByTestId('continue-button');
  }

  async continue(): Promise<void> {
    await this.continueButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.confirmation).toBeVisible();
  }
}
