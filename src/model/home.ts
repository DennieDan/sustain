// UI-01, UI-04: wording shared by the sidebar and the status bar. Browser-safe.
import type { MapItem, RunCard } from "./messages";

/** "just now", "5 minutes ago", "2 days ago". */
export function relativeAge(fromIso: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / 1000));
  const steps: [number, string][] = [
    [60 * 60 * 24 * 365, "year"],
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
  ];
  for (const [size, unit] of steps) {
    const count = Math.floor(seconds / size);
    if (count >= 1) return `${count} ${unit}${count === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** The header's map status: "Map from 2 days ago · 16 boxes", or "No map yet". */
export function mapStatus(maps: readonly MapItem[], now: Date): string {
  const newest = maps[0];
  if (newest === undefined) return "No map yet";
  const age = relativeAge(newest.createdAt, now);
  const parts = [age === "just now" ? "Map from just now" : `Map from ${age}`];
  if (newest.boxes !== null) parts.push(`${newest.boxes} box${newest.boxes === 1 ? "" : "es"}`);
  if (newest.changed !== null && newest.changed > 0) parts.push(`${newest.changed} changed`);
  return parts.join(" · ");
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const pad = (n: number): string => String(n).padStart(2, "0");
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(total % 60)}` : `${minutes}:${pad(total % 60)}`;
}

/** Tokens as "12.4k" from a thousand on. */
export function tokenCount(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

/** The run card's figures line: "1:32 · 18.2k in · 1.2k out · $0.41". */
export function runFigures(run: RunCard, now: Date): string {
  const end = run.finishedAt === null ? now.getTime() : Date.parse(run.finishedAt);
  const parts = [clock(end - Date.parse(run.startedAt))];
  const input = run.usage.input + run.usage.cacheRead + run.usage.cacheWrite;
  if (input + run.usage.output > 0) parts.push(`${tokenCount(input)} in`, `${tokenCount(run.usage.output)} out`);
  if (run.costUsd !== null) parts.push(`$${run.costUsd.toFixed(2)}`);
  return parts.join(" · ");
}

/** What the status bar item shows (UI-04). */
export interface StatusInput {
  /** The running run's start, or `null` when nothing runs. */
  runningSince: string | null;
  /** Edited or missing boxes in the shown map. */
  changed: number;
}

export function statusText(input: StatusInput, now: Date): string {
  if (input.runningSince !== null) return `Sustain: generating ${clock(now.getTime() - Date.parse(input.runningSince))}`;
  if (input.changed > 0) return `Sustain: ${input.changed} changed`;
  return "Sustain";
}

/** The commands the sidebar offers as buttons, keyed by the message the button posts (UI-01). */
export const SIDEBAR_ACTIONS: Readonly<Record<string, string>> = {
  generate: "sustain.generateArchitecture",
  openMap: "sustain.openArchitecture",
  refreshMap: "sustain.refreshArchitecture",
  exportMap: "sustain.exportPage",
  review: "sustain.reviewChanges",
  startLearning: "sustain.startLearning",
  checkSetup: "sustain.checkSetup",
  cancelRun: "sustain.cancelRun",
  fix: "sustain.installSkills",
  suggestRules: "sustain.suggestRules",
  practiceStart: "sustain.checkUnderstanding",
  createTour: "sustain.createTour",
  copyPromptFor: "sustain.copyPromptFor",
};

/** The map's freshness header (FRS-03), or `null` when no box changed. */
export function freshnessHeader(changed: number, total: number, revision: string | null, createdAt: string | null, now: Date): string | null {
  if (changed === 0) return null;
  const since = [revision?.slice(0, 7), createdAt === null ? null : relativeAge(createdAt, now)].filter((part): part is string => part !== null && part !== undefined);
  const boxes = `${changed} of ${total} box${total === 1 ? "" : "es"} changed since this map`;
  return since.length === 0 ? boxes : `${boxes} (${since.join(", ")})`;
}
