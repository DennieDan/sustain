// ARC-03: hotspots for a folder's maps, from git's log over `sustain.hotspots.days`. The log is
// read at most once a minute per folder.
import * as vscode from "vscode";
import { changeLog, type LoggedCommit } from "../model/git";
import { hotspotNote, hotspots, type BoxHotspot } from "../model/hotspots";

/** How long a folder's log is reused. */
export const HOTSPOT_TTL_MS = 60_000;

const logs = new Map<string, { at: number; days: number; log: LoggedCommit[] }>();

/** `sustain.hotspots.days`, 90 by default. */
export function hotspotDays(): number {
  const days = vscode.workspace.getConfiguration("sustain").get<number>("hotspots.days", 90);
  return Number.isInteger(days) && days >= 1 ? days : 90;
}

/** The hotspots of `components` in `root`, busiest first. */
export function hotspotsFor(root: string, components: readonly { id: string; sources?: readonly { path: string }[] }[], now = Date.now()): BoxHotspot[] {
  const days = hotspotDays();
  let cached = logs.get(root);
  if (cached === undefined || cached.days !== days || now - cached.at >= HOTSPOT_TTL_MS) {
    cached = { at: now, days, log: changeLog(root, days) ?? [] };
    logs.set(root, cached);
  }
  return hotspots(cached.log, components);
}

/** Each box's heat level and tooltip line, for the map. */
export function hotspotMarks(boxes: readonly BoxHotspot[]): Record<string, { level: number; note: string }> {
  const days = hotspotDays();
  return Object.fromEntries(boxes.map((box) => [box.id, { level: box.level, note: hotspotNote(box, days) }]));
}

/** Forgets every read log, for the tests. */
export function forgetHotspots(): void {
  logs.clear();
}
