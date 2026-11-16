import { test as base, type Response } from '@playwright/test';
import {
  evidenceUrl,
  HTTP_EVIDENCE_ATTACHMENT,
  type DocumentResponse,
  type HttpEvidence,
} from '../errors/http-evidence';

/**
 * SQAF — HTTP evidence fixture (Stage 5 adjustment). See ADR-0008 D14.
 *
 * AUTOMATIC: records the status of the last response to a navigation of the
 * MAIN FRAME of any page of the test's context (sub-resources, XHR/fetch,
 * iframes and API calls are ignored). Only when the attempt FAILS is it
 * attached as `sqaf-http-evidence`, so the failure classification can use the
 * real HTTP status instead of the page text.
 *
 * It only observes: it never changes navigation, waits or results. No body,
 * header, query string or form value is recorded.
 */
export interface HttpEvidenceFixtures {
  readonly httpEvidence: void;
}

export const test = base.extend<HttpEvidenceFixtures>({
  httpEvidence: [
    async ({ context }, use, testInfo) => {
      let lastDocument: DocumentResponse | undefined;
      const onResponse = (response: Response): void => {
        try {
          const request = response.request();
          if (!request.isNavigationRequest() || request.frame().parentFrame() !== null) return;
          lastDocument = {
            method: request.method(),
            url: evidenceUrl(response.url()),
            status: response.status(),
            statusText: response.statusText(),
          };
        } catch {
          // Service-worker or detached-frame responses have no usable frame.
        }
      };
      context.on('response', onResponse);
      await use();
      context.off('response', onResponse);

      if (lastDocument !== undefined && testInfo.status !== testInfo.expectedStatus) {
        const evidence: HttpEvidence = { schemaVersion: 1, lastDocument };
        await testInfo.attach(HTTP_EVIDENCE_ATTACHMENT, {
          contentType: 'application/json',
          body: JSON.stringify(evidence, null, 2),
        });
      }
    },
    { auto: true },
  ],
});
