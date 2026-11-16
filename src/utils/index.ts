/**
 * SQAF — Common Utilities layer entry point (Stage 5).
 *
 * Business-independent, side-effect-free helpers. This layer imports only
 * `config`; it never imports the Error Handling layer (architecture.md §2).
 */
export {
  detectAntiBotChallenge,
  readPageSignature,
  type AntiBotDetection,
  type PageLike,
  type PageSignature,
} from './anti-bot-detector';
export { formatDuration } from './duration';
export { describeValue, isInteger, isNonEmptyString, isRecord, type JsonRecord } from './guards';
export { CURRENCY_PREFIX, formatPrice, parsePrice } from './price';
export { containsText, htmlText, htmlTitle, normalizeText, stripAnsi } from './text';
export { createIdSource, createRunToken, randomSecret, uniqueEmail, uniqueId, type IdSource } from './unique';
