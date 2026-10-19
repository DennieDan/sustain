// `<run folder>/lineage.json` (FR-UPD-04): which run this one updates, the commit it was drawn
// at and how many updates happened since the last regeneration. Written by change-map.mjs.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isJsonObject, stringifyDocument } from "./types";

export const LINEAGE_FILE = "lineage.json";

export type RunMode = "update" | "regenerate";

export interface Lineage {
  mode: RunMode;
  /** The FR-UPD-02 reason. */
  reason: string;
  /** Run folder name of the previous candidate, or `null`. */
  previousRun: string | null;
  /** Commit the change map was taken from, or `null`. */
  baseRevision: string | null;
  /** HEAD when this run started, or `null` without git facts. */
  revision: string | null;
  /** Uncommitted paths when this run started (FR-GIT-01, at most 200). */
  dirty: string[];
  /** Total number of uncommitted paths. */
  dirtyCount: number;
  updatesSinceRegeneration: number;
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** The lineage in `runDir`, or `null` when it is missing, unreadable or malformed. */
export function readLineage(runDir: string): Lineage | null {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(join(runDir, LINEAGE_FILE), "utf8"));
  } catch {
    return null;
  }
  if (!isJsonObject(value)) return null;
  const { mode, reason, previousRun, baseRevision, revision, dirty, dirtyCount, updatesSinceRegeneration } = value;
  if (mode !== "update" && mode !== "regenerate") return null;
  if (typeof reason !== "string" || !isNullableString(previousRun) || !isNullableString(baseRevision) || !isNullableString(revision)) return null;
  if (!Array.isArray(dirty) || !dirty.every((path) => typeof path === "string")) return null;
  if (!isCount(dirtyCount) || !isCount(updatesSinceRegeneration)) return null;
  return { mode, reason, previousRun, baseRevision, revision, dirty: dirty as string[], dirtyCount, updatesSinceRegeneration };
}

/** Writes `lineage` as 2-space JSON into `runDir`. */
export function writeLineage(runDir: string, lineage: Lineage): void {
  writeFileSync(join(runDir, LINEAGE_FILE), stringifyDocument(lineage));
}
