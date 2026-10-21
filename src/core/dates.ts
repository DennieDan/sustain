// How long ago a time was, in the words the sidebar and the changes panel show. Browser-safe.

const DAY_SECONDS = 24 * 60 * 60;
/** Units from the largest down. An age with a date cutoff uses the units from days down. */
const UNITS: readonly [seconds: number, unit: string][] = [
  [365 * DAY_SECONDS, "year"],
  [30 * DAY_SECONDS, "month"],
  [DAY_SECONDS, "day"],
  [60 * 60, "hour"],
  [60, "minute"],
];

/**
 * "just now", "5 minutes ago", "2 days ago". Without `dateAfterDays`, ages go on into months and
 * years. With it, ages stop at days, a time more than `dateAfterDays` days back reads as its ISO
 * date `YYYY-MM-DD`, and an unparseable time gives `undefined`. A time in the future is "just now".
 */
export function relativeAge(iso: string, now: Date): string;
export function relativeAge(iso: string, now: Date, dateAfterDays: number): string | undefined;
export function relativeAge(iso: string, now: Date, dateAfterDays?: number): string | undefined {
  const time = Date.parse(iso);
  if (dateAfterDays !== undefined) {
    if (Number.isNaN(time)) return undefined;
    if (now.getTime() - time > dateAfterDays * DAY_SECONDS * 1000) {
      return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : new Date(time).toISOString().slice(0, 10);
    }
  }
  const seconds = Math.max(0, Math.floor((now.getTime() - time) / 1000));
  for (const [size, unit] of dateAfterDays === undefined ? UNITS : UNITS.slice(2)) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
