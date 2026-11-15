import { expect } from '@playwright/test';
import { BasePage } from './base.page';

/** SQAF — Home page (`/`). Ready when the document title is the SUT's home title. */
export class HomePage extends BasePage {
  protected readonly path = '/';

  protected async assertReady(): Promise<void> {
    await expect(this.page).toHaveTitle('Automation Exercise');
  }
}
