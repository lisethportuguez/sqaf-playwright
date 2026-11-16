/**
 * SQAF — Duration formatting (Stage 5). Pure function for reports and logs.
 *
 *   850 → '850 ms'   1500 → '1.5 s'   59_940 → '59.9 s'   125_000 → '2 min 05 s'
 *   3_725_000 → '1 h 02 min 05 s'
 */
export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    throw new RangeError(`A duration must be a finite, non-negative number of milliseconds, received ${milliseconds}.`);
  }
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) {
    const seconds = Math.floor(milliseconds / 100) / 10; // truncate: never rounds up to "60.0 s"
    return `${seconds.toFixed(1)} s`;
  }
  const totalSeconds = Math.round(milliseconds / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours} h ${pad(minutes)} min ${pad(seconds)} s` : `${minutes} min ${pad(seconds)} s`;
}
