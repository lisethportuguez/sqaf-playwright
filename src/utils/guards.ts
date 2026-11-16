/**
 * SQAF — Type guards for untyped input (JSON files, API bodies). Stage 5.
 * Shared by the data and API layers, so neither re-implements them.
 */

export type JsonRecord = Readonly<Record<string, unknown>>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** Short, safe description of a value for error messages (never the full value). */
export function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return value.length === 0 ? 'an empty string' : 'a string';
  return typeof value === 'object' ? 'an object' : `${typeof value} ${String(value)}`;
}
