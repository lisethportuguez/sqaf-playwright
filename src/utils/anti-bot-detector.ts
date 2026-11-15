import type { Page } from '@playwright/test';
import { CLOUDFLARE_CHALLENGE_SIGNATURES, type AntiBotSignatures } from '../../config/anti-bot';

/**
 * SQAF — Anti-bot challenge detection (Stage 1). See ADR-0006.
 *
 * `detectAntiBotChallenge` is pure: it only compares strings, so it is tested
 * without a browser or the SUT. `readPageSignature` extracts those strings
 * from a Playwright page. Raising the error is the job of the Error Handling
 * layer (`src/errors/anti-bot-guard.ts`): utilities never depend on errors.
 *
 * Detection only. Nothing here tries to solve, wait out or bypass a challenge.
 */

export interface PageSignature {
  readonly title: string;
  readonly bodyText: string;
  readonly url?: string;
}

export interface AntiBotDetection {
  readonly detected: boolean;
  /** Human-readable description of each signature that matched. */
  readonly matched: readonly string[];
}

/** Removes ANSI colour codes, as printed by Playwright in error messages. */
export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

/** Strips ANSI codes, collapses whitespace and unifies the Unicode ellipsis with "...". */
export function normalizeText(value: string): string {
  return stripAnsi(value).replace(/…/g, '...').replace(/\s+/g, ' ').trim();
}

/**
 * A page is a challenge when its title is EXACTLY a challenge title, or its
 * body contains a FULL challenge sentence. Fragments ("One moment", "Please
 * wait") and titles that merely contain the challenge title do not match.
 */
export function detectAntiBotChallenge(
  page: PageSignature,
  signatures: AntiBotSignatures = CLOUDFLARE_CHALLENGE_SIGNATURES,
): AntiBotDetection {
  const title = normalizeText(page.title);
  const body = normalizeText(page.bodyText).toLowerCase();
  const matched: string[] = [];

  for (const candidate of signatures.titles) {
    if (title === normalizeText(candidate)) matched.push(`title is "${candidate}"`);
  }
  for (const phrase of signatures.bodyPhrases) {
    if (body.includes(normalizeText(phrase).toLowerCase())) matched.push(`body contains "${phrase}"`);
  }
  return { detected: matched.length > 0, matched: Object.freeze(matched) };
}

/** Minimal surface of Page used to read a signature (eases unit testing). */
export type PageLike = Pick<Page, 'title' | 'url' | 'evaluate'>;

export async function readPageSignature(page: PageLike): Promise<PageSignature> {
  const [title, bodyText] = await Promise.all([
    page.title(),
    page.evaluate(() => document.body?.innerText ?? ''),
  ]);
  return { title, bodyText, url: page.url() };
}
