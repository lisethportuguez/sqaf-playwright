import type { Locator } from '@playwright/test';

/** Panels of the category sidebar. */
export type SidebarSection = 'Women' | 'Men' | 'Kids';

/** Accessible name of a section toggle: an icon glyph, then the section name. */
const sectionName = (section: SidebarSection): RegExp => new RegExp(String.raw`^\W*${section}$`);

/**
 * SQAF — Category sidebar (Stage 4, TC18). Present on the home, products and
 * category pages.
 *
 * SUT DOM (observed 2026-11-16): `.left-sidebar` with the heading "Category"
 * and a Bootstrap accordion: one `.panel` per section whose toggle link
 * ("Women", "Men", "Kids", preceded by an icon glyph, hence the anchored
 * pattern) expands a collapsed list of category links ("Dress", "Tops", ...).
 * There is no landmark or data-qa, hence the CSS scope (ADR-0007). The
 * accordion is bound by jQuery: the page's `waitUntilReady()` (load event)
 * must have run before `openCategory()`.
 */
export class CategorySidebar {
  readonly heading: Locator;

  constructor(readonly root: Locator) {
    this.heading = root.getByRole('heading', { name: 'Category', exact: true });
  }

  sectionToggle(section: SidebarSection): Locator {
    return this.root.getByRole('link', { name: sectionName(section) });
  }

  categoryLink(section: SidebarSection, name: string): Locator {
    // `has` is evaluated INSIDE each panel, so it is built from the page, not from the root.
    const toggle = this.root.page().getByRole('link', { name: sectionName(section) });
    return this.root.locator('.panel').filter({ has: toggle }).getByRole('link', { name, exact: true });
  }

  /** Expands the section and opens one of its categories (the click waits for the link to be visible). */
  async openCategory(section: SidebarSection, name: string): Promise<void> {
    await this.sectionToggle(section).click();
    await this.categoryLink(section, name).click();
  }
}
