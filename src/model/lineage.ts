// `<run folder>/lineage.json` (FR-UPD-04): which run this one updates, the commit it was drawn
// at and how many updates happened since the last regeneration. Written by change-map.mjs, with
// the commit details of FR-CMP-01; `changes.json` (FR-CMP-02) is read and written here too.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseRunChanges, type RunChanges } from "./runChanges";
import { isJsonObject, stringifyDocument } from "./types";

export const LINEAGE_FILE = "lineage.json";
export const CHANGES_FILE = "changes.json";

export type RunMode = "update" | "regenerate";

/** One commit as `lineage.json` records it (FR-CMP-01). */
export interface CommitInfo {
  /** First line of the commit message. */
  subject: string;
  /** Committer date, ISO 8601 (`%cI`). */
  committedAt: string;
}

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
  /** Subject and date of `baseRevision`, or `null` (FR-CMP-01). */
  baseCommit: CommitInfo | null;
  /** Subject and date of `revision`, or `null` (FR-CMP-01). */
  headCommit: CommitInfo | null;
  /** Uncommitted paths when this run started (FR-GIT-01, at most 200). */
  dirty: string[];
  /** Total number of uncommitted paths. */
  dirtyCount: number;
  updatesSinceRegeneration: number;
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** A recorded commit, or `null` when missing or malformed (M6 lineages have none). */
function readCommit(value: unknown): CommitInfo | null {
  if (!isJsonObject(value)) return null;
  const { subject, committedAt } = value;
  return typeof subject === "string" && typeof committedAt === "string" ? { subject, committedAt } : null;
}

/** Parsed JSON of `runDir/file`, or `undefined` when it is missing, unreadable or not JSON. */
function readJson(runDir: string, file: string): unknown {
  try {
    return JSON.parse(readFileSync(join(runDir, file), "utf8"));
  } catch {
    return undefined;
  }
}

/** The lineage in `runDir`, or `null` when it is missing, unreadable or malformed. */
export function readLineage(runDir: string): Lineage | null {
  const value = readJson(runDir, LINEAGE_FILE);
  if (!isJsonObject(value)) return null;
  const { mode, reason, previousRun, baseRevision, revision, dirty, dirtyCount, updatesSinceRegeneration } = value;
  if (mode !== "update" && mode !== "regenerate") return null;
  if (typeof reason !== "string" || !isNullableString(previousRun) || !isNullableString(baseRevision) || !isNullableString(revision)) return null;
  if (!Array.isArray(dirty) || !dirty.every((path) => typeof path === "string")) return null;
  if (!isCount(dirtyCount) || !isCount(updatesSinceRegeneration)) return null;
  return {
    mode,
    reason,
    previousRun,
    baseRevision,
    revision,
    baseCommit: readCommit(value["baseCommit"]),
    headCommit: readCommit(value["headCommit"]),
    dirty: dirty as string[],
    dirtyCount,
    updatesSinceRegeneration,
  };
}

/** Writes `lineage` as 2-space JSON into `runDir`. */
export function writeLineage(runDir: string, lineage: Lineage): void {
  writeFileSync(join(runDir, LINEAGE_FILE), stringifyDocument(lineage));
}

/** The `changes.json` in `runDir`, or `null` when it is missing, unreadable or malformed. */
export function readRunChanges(runDir: string): RunChanges | null {
  return parseRunChanges(readJson(runDir, CHANGES_FILE));
}

/** Writes `changes` as 2-space JSON into `runDir`. */
export function writeRunChanges(runDir: string, changes: RunChanges): void {
  writeFileSync(join(runDir, CHANGES_FILE), stringifyDocument(changes));
}
