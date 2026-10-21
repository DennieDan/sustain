// SET-05: the opt-in usage log. It keeps how many times each of a fixed set of actions ran per day,
// and nothing else: no paths, labels, repository names or anything a user typed. Browser-safe.

/** The actions the log counts. Nothing outside this list is ever recorded. */
export const USAGE_EVENTS = [
  "generate",
  "refresh",
  "audit",
  "ask",
  "review",
  "showChanges",
  "exportPage",
  "checkUnderstanding",
  "tour",
  "createTour",
  "drillDown",
  "find",
  "learn",
  "copyPrompt",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

/** Days of counts, by `YYYY-MM-DD`, each with a count per action that ran that day. */
export interface UsageLog {
  schema: 1;
  days: Record<string, Partial<Record<UsageEvent, number>>>;
}

/** Days the log keeps. */
export const USAGE_DAYS = 90;

export function emptyUsageLog(): UsageLog {
  return { schema: 1, days: {} };
}

/** `log` with one more `event` on `now`'s day, and days older than {@link USAGE_DAYS} dropped. Other values are ignored. */
export function recordUsage(log: UsageLog, event: string, now: Date): UsageLog {
  if (!(USAGE_EVENTS as readonly string[]).includes(event)) return log;
  const day = now.toISOString().slice(0, 10);
  const oldest = new Date(now.getTime() - (USAGE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const days: UsageLog["days"] = {};
  for (const [key, counts] of Object.entries(log.days)) if (key >= oldest) days[key] = { ...counts };
  const counts = (days[day] ??= {});
  counts[event as UsageEvent] = (counts[event as UsageEvent] ?? 0) + 1;
  return { schema: 1, days };
}

/** The log as the exported file holds it. */
export function usageExport(log: UsageLog): string {
  return `${JSON.stringify(log, null, 2)}\n`;
}
