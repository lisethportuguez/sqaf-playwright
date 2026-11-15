import { detectAntiBotChallenge, readPageSignature, type PageLike } from '../utils/anti-bot-detector';
import { INFRASTRUCTURE_ANTI_BOT, InfrastructureError } from './infrastructure-error';

/**
 * SQAF — Anti-bot guard (Stage 1). See ADR-0006.
 *
 * Throws InfrastructureError when the current page is an anti-bot challenge,
 * so the test fails with an explicit, classifiable cause instead of a generic
 * assertion timeout. Called by the navigation fixtures from Stage 2.
 *
 * It does not wait, retry or try to bypass the challenge.
 */
export async function assertNoAntiBotChallenge(page: PageLike): Promise<void> {
  const signature = await readPageSignature(page);
  const detection = detectAntiBotChallenge(signature);
  if (!detection.detected) return;
  throw new InfrastructureError({
    classification: INFRASTRUCTURE_ANTI_BOT,
    summary: 'The System Under Test answered with an anti-bot challenge page instead of the application.',
    evidence: detection.matched,
    ...(signature.url ? { url: signature.url } : {}),
  });
}
