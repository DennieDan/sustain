// SKL-03: the practice log. Bug hunts from `.sustain/`, explain-backs from workspace state and the
// tours the user finished, newest first with their dates. Nothing in it leaves the machine.
// Browser-safe.
import type { LeaderboardEntry } from "./leaderboard";
import type { PracticeLogEntry } from "./messages";
import type { PracticeCheck } from "./practice";

/** A tour played to its last stop. */
export interface FinishedTour {
  root: string;
  /** The map's title, or its run folder. */
  title: string;
  stops: number;
  finishedAt: string;
}

/** Entries the log shows. */
export const LOG_LIMIT = 20;

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The log for one folder: finished hunts, fully graded explain-backs and finished tours, newest first. */
export function practiceLog(hunts: readonly LeaderboardEntry[], checks: readonly PracticeCheck[], tours: readonly FinishedTour[], limit = LOG_LIMIT): PracticeLogEntry[] {
  const entries: PracticeLogEntry[] = [];
  for (const hunt of hunts) {
    if (hunt.status !== "completed" && hunt.status !== "abandoned") continue;
    entries.push({ kind: "hunt", title: "Bug hunt", detail: `${plural(hunt.score, "point")} · ${hunt.fixed} of ${plural(hunt.bugs, "bug")} fixed${hunt.status === "abandoned" ? " · abandoned" : ""}`, at: hunt.endedAt });
  }
  for (const check of checks) {
    if (check.questions.length === 0 || !check.questions.every((entry) => entry.grade !== null)) continue;
    const count = (grade: string): number => check.questions.filter((entry) => entry.grade?.grade === grade).length;
    entries.push({ kind: "explain", title: `Explain-back · ${check.scope}`, detail: `${count("correct")} correct, ${count("partial")} partial, ${count("wrong")} wrong`, at: check.startedAt });
  }
  for (const tour of tours) entries.push({ kind: "tour", title: `Tour of ${tour.title}`, detail: plural(tour.stops, "stop"), at: tour.finishedAt });
  return entries.filter((entry) => entry.at !== "").sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
