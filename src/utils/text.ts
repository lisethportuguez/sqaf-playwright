/**
 * SQAF — Text utilities (Stage 1, moved here in Stage 5). Pure functions.
 */

/** Removes ANSI colour codes, as printed by Playwright in error messages. */
export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Strips ANSI codes, collapses whitespace and unifies the Unicode ellipsis with "...". */
export function normalizeText(value: string): string {
  return stripAnsi(value).replace(/…/g, '...').replace(/\s+/g, ' ').trim();
}

/** Case-insensitive containment after normalization, for example a search term inside a product name. */
export function containsText(haystack: string, needle: string): boolean {
  return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
}

/** Minimal HTML reading for non-browser responses (API bodies): the `<title>` text, if any. */
export function htmlTitle(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? normalizeText(decodeBasicEntities(match[1]!)) : '';
}

/** Visible-ish text of an HTML document: scripts, styles and tags removed, whitespace collapsed. */
export function htmlText(html: string): string {
  const withoutCode = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  return normalizeText(decodeBasicEntities(withoutCode.replace(/<[^>]+>/g, ' ')));
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
