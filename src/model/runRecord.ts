// CST-04: run.json records a run's kind, scope and progress beside its candidate.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertWritable } from "./confine";
import { ARCHIFY_DIR } from "./runFolder";
import { writeJson } from "./session";
import { isJsonObject } from "./types";

export const RUN_FILE = "run.json";

export type RunKind = "full" | "refresh" | "drill";
export type RunPhase = "created" | "validating" | "accepted" | "rejected";

/** The estimate stated before the run (CST-03). */
export interface RunEstimateRecord {
  low: number;
  high: number;
  basis: "provisional" | "fitted";
  model: string | null;
}

export interface RunTokens {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface RunRecord {
  schema: 1;
  kind: RunKind;
  focus: string;
  /** Path globs a refresh or drill-down is limited to; empty for a whole run. */
  paths: string[];
  /** The run folder a refresh starts from. */
  base: string | null;
  /** The run folder a drill-down came from. */
  parent: string | null;
  createdAt: string;
  skillVersion: string;
  phase: RunPhase;
  /** Validator runs so far. */
  attempts: number;
  finishedAt?: string;
  /** Added by the extension when it launched the run. */
  agent?: string;
  mode?: "sidebar" | "terminal";
  tokens?: RunTokens;
  costUsd?: number;
  estimate?: RunEstimateRecord;
}

/** A fresh record for a run created now. */
export function newRunRecord(fields: { kind?: RunKind; focus: string; paths?: string[]; base?: string | null; parent?: string | null; skillVersion: string }, now = new Date()): RunRecord {
  return {
    schema: 1,
    kind: fields.kind ?? "full",
    focus: fields.focus,
    paths: fields.paths ?? [],
    base: fields.base ?? null,
    parent: fields.parent ?? null,
    createdAt: now.toISOString(),
    skillVersion: fields.skillVersion,
    phase: "created",
    attempts: 0,
  };
}

/** The record in `runDir`, or `null` when it is missing or not a run record. */
export function readRunRecord(runDir: string): RunRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(join(runDir, RUN_FILE), "utf8"));
    return isJsonObject(value) && value["schema"] === 1 && typeof value["phase"] === "string" ? (value as unknown as RunRecord) : null;
  } catch {
    return null;
  }
}

/** Writes `record` to `runDir/run.json`, which must lie inside `root`. */
export function writeRunRecord(root: string, runDir: string, record: RunRecord): void {
  const path = join(runDir, RUN_FILE);
  assertWritable(root, path);
  writeJson(path, record);
}

/** Merges `patch` into the record in `runDir`, starting from `fallback` when there is none. */
export function updateRunRecord(root: string, runDir: string, patch: Partial<RunRecord>, fallback: () => RunRecord): RunRecord {
  const next = { ...(readRunRecord(runDir) ?? fallback()), ...patch };
  writeRunRecord(root, runDir, next);
  return next;
}

/** The folder names in `root/.archify`, taken before a run so the one it creates can be found. */
export function runFolderNames(root: string): Set<string> {
  try {
    return new Set(readdirSync(join(root, ARCHIFY_DIR)));
  } catch {
    return new Set();
  }
}

/** The run folder created since `before` whose record started last, or `null` when there is none yet. */
export function newRunSince(root: string, before: ReadonlySet<string>): { runFolder: string; dir: string; record: RunRecord } | null {
  let found: { runFolder: string; dir: string; record: RunRecord } | null = null;
  for (const runFolder of runFolderNames(root)) {
    if (before.has(runFolder)) continue;
    const dir = join(root, ARCHIFY_DIR, runFolder);
    const record = readRunRecord(dir);
    if (record !== null && (found === null || record.createdAt > found.record.createdAt)) found = { runFolder, dir, record };
  }
  return found;
}
