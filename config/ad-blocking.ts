import type { BrowserContext } from '@playwright/test';

/**
 * Ad-blocking policy for the System Under Test (Automation Exercise).
 *
 * Only advertising hosts observed in real traffic of automationexercise.com
 * (inventory taken on 2026-11-15) are blocked. Matching is by EXACT hostname,
 * never by broad wildcard, so functional resources (the SUT itself, fonts,
 * Cloudflare) are never affected.
 *
 * The same policy MUST be applied to the baseline and to SQAF tests so the
 * experimental comparison stays fair. See ADR-0002.
 */
export const BLOCKED_AD_HOSTS: readonly string[] = [
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'fundingchoicesmessages.google.com',
  'ep1.adtrafficquality.google',
  'ep2.adtrafficquality.google',
];

export function isBlockedAdHost(url: URL): boolean {
  return BLOCKED_AD_HOSTS.includes(url.hostname);
}

/** Aborts every request whose hostname is in BLOCKED_AD_HOSTS. */
export async function blockAds(context: BrowserContext): Promise<void> {
  await context.route(isBlockedAdHost, (route) => route.abort('blockedbyclient'));
}
