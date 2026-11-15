import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * SQAF — "Account Created!" confirmation (reached only after creating an
 * account, so it is not opened directly). `data-qa` locators observed in
 * Stage 0 (TC1). Not exercised against the SUT in Stage 2 (D8).
 */
export class AccountCreatedPage extends BasePage {
  protected readonly path = undefined;

  readonly confirmation: Locator;
  readonly continueButton: Locator;

  constructor(page: AccountCreatedPage['page']) {
    super(page);
    this.confirmation = page.getByTestId('account-created');
    this.continueButton = page.getByTestId('continue-button');
  }

  async continue(): Promise<void> {
    await this.continueButton.click();
  }

  protected async assertReady(): Promise<void> {
    await expect(this.confirmation).toBeVisible();
  }
}
