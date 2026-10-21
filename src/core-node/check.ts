// PRC-01: `sustain.mjs check`, which compares a diff with the map at zero tokens. This gathers
// the map, the config, the diff from the merge-base, the code at the head and the changed files'
// imports on both sides (PRC-06); delta.ts decides.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseDiff, type FileChange } from "./changes";
import { CONFIG_FILE, readConfig, type FailOn, type SustainConfig } from "./config";
import { deltaReport, isSourceFile, verdict, type DeltaReport } from "./delta";
import { listCandidates } from "./discovery";
import { importLanguage, importResolver } from "./evidence/graph";
import { diffBetween, existsAt, fileAt, filesAt, mergeBase, renamesSince, untrackedFiles } from "./git";
import { isRevision } from "../core/gitFormat";
import { globToRegExp } from "./glob";
import { isTestPath, listFiles } from "./repoSize";
import { checkRules, readRules, type Violation } from "./rules";
import type { ImportRef } from "./evidence/paths";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "./runFolder";
import { readRunRecord } from "./runRecord";
import { fileReader, mapFreshness, readFingerprints } from "./staleness";
import { readDiagram, type ViewDiagram } from "../core/tolerant";

export interface CheckOptions {
  root: string;
  base: string;
  /** Without a head, the working tree is compared. */
  head?: string;
  /** A run folder; else the config's `map`, else the main map. */
  map?: string;
  failOn?: FailOn[];
}

export interface CheckReport extends DeltaReport {
  map: string;
  base: string;
  head: string | null;
  mergeBase: string;
  result: "pass" | "fail";
  reasons: string[];
}

export type CheckOutcome = { ok: true; report: CheckReport; diagram: ViewDiagram } | { ok: false; reason: string };

/** The repository's config, `{}` without a file. */
export function loadConfig(root: string): { ok: true; config: SustainConfig } | { ok: false; reason: string } {
  let text: string;
  try {
    text = readFileSync(join(root, CONFIG_FILE), "utf8");
  } catch {
    return { ok: true, config: {} };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `${CONFIG_FILE} is not valid JSON: ${(error as Error).message}` };
  }
  const result = readConfig(value);
  return result.ok ? result : { ok: false, reason: `${CONFIG_FILE}: ${result.errors.join("; ")}` };
}

/** The main map: the newest accepted run with an empty focus. A run without run.json counts as unfocused. */
export function mainMap(root: string): string | null {
  for (const candidate of listCandidates(root)) {
    if ((readRunRecord(dirname(candidate.file))?.focus ?? "") === "") return candidate.runFolder;
  }
  return null;
}

function countLines(bytes: Buffer): number {
  if (bytes.length === 0) return 0;
  const newlines = bytes.reduce((sum, byte) => sum + (byte === 0x0a ? 1 : 0), 0);
  return bytes[bytes.length - 1] === 0x0a ? newlines : newlines + 1;
}

/** Every file under `dir` in the working tree, skipping `.git` and `node_modules`. */
function filesOnDisk(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(root, rel));
    } catch {
      return;
    }
    for (const name of names) {
      if (name === ".git" || name === "node_modules") continue;
      const path = rel === "" ? name : `${rel}/${name}`;
      try {
        if (statSync(join(root, path)).isDirectory()) walk(path);
        else out.push(path);
      } catch {
        // Gone while walking.
      }
    }
  };
  walk(dir);
  return out;
}

export function runCheck(options: CheckOptions): CheckOutcome {
  const { root, base, head } = options;
  if (!isRevision(base, "name") || (head !== undefined && !isRevision(head, "name"))) return { ok: false, reason: "--base and --head take revisions such as origin/main or HEAD." };
  const config = loadConfig(root);
  if (!config.ok) return config;
  const run = options.map ?? config.config.map ?? mainMap(root);
  if (run === null) return { ok: false, reason: `No map to check against. Generate one with an empty focus, or name one with --map or "map" in ${CONFIG_FILE}.` };
  const runDir = join(root, ARCHIFY_DIR, run);
  let diagram: ViewDiagram;
  try {
    const read = readDiagram(JSON.parse(readFileSync(join(runDir, CANDIDATE_FILE), "utf8")));
    if (!read.ok) return { ok: false, reason: `${ARCHIFY_DIR}/${run}/${CANDIDATE_FILE}: ${read.reason}` };
    diagram = read.diagram;
  } catch (error) {
    return { ok: false, reason: `Cannot read ${ARCHIFY_DIR}/${run}/${CANDIDATE_FILE}: ${(error as Error).message}` };
  }

  const shared = mergeBase(root, base, head ?? "HEAD");
  if (shared === null) return { ok: false, reason: `No common commit between ${base} and ${head ?? "HEAD"}.` };
  const diff = diffBetween(root, shared, head ?? null);
  if (diff === null) return { ok: false, reason: `git diff ${shared} ${head ?? ""} failed.` };
  const changes: FileChange[] = parseDiff(diff).filter((change) => !change.path.startsWith(`${ARCHIFY_DIR}/`));
  if (head === undefined) {
    for (const path of untrackedFiles(root).filter((file) => !file.startsWith(`${ARCHIFY_DIR}/`))) {
      const bytes = fileReader(root)(path);
      changes.push({ path, oldPath: path, status: "added", hunks: [], added: bytes === null ? 0 : countLines(bytes) });
    }
  }

  const prints = readFingerprints(runDir);
  const read = head === undefined ? fileReader(root) : (path: string) => fileAt(root, head, path);
  const text = (path: string): string | null => read(path)?.toString("utf8") ?? null;
  // PRC-06: each changed source file's imports at the merge base and at the head, both resolved
  // against the head's files.
  const headFiles = head === undefined ? [...new Set([...listFiles(root).files, ...changes.map((change) => change.path)])] : filesAt(root, head, "");
  const resolve = importResolver(headFiles, text);
  const imports = { base: new Map<string, string[]>(), head: new Map<string, string[]>() };
  const headRefs = new Map<string, ImportRef[]>();
  for (const change of changes) {
    if (change.status === "deleted" || importLanguage(change.path) === null) continue;
    const now = text(change.path);
    if (now !== null) {
      const refs = resolve(change.path, now);
      imports.head.set(change.path, refs.map((ref) => ref.path));
      if (!isTestPath(change.path)) headRefs.set(change.path, refs);
    }
    const before = change.status === "added" ? null : (fileAt(root, shared, change.oldPath)?.toString("utf8") ?? null);
    if (before !== null) imports.base.set(change.path, resolve(change.oldPath, before).map((ref) => ref.path));
  }
  // ARC-01: rule violations in the imports the diff added.
  const violations: Violation[] = checkRules(readRules(config.config.rules ?? []).rules, diagram.components, headRefs).filter((violation) => !(imports.base.get(violation.file) ?? []).includes(violation.imported));
  const renames = prints?.revision ? renamesSince(root, prints.revision, process.env, head) : new Map<string, string>();
  const delta = deltaReport({
    components: diagram.components,
    changes,
    freshness: mapFreshness(prints, read, renames),
    ignore: (config.config.ignore ?? []).map(globToRegExp),
    existedAtBase: (dir) => existsAt(root, shared, dir),
    sourceFilesIn: (dir) => (head === undefined ? filesOnDisk(root, dir) : filesAt(root, head, dir)).filter(isSourceFile).length,
    connections: diagram.connections,
    imports,
    violations,
  });
  const outcome = verdict(delta, options.failOn ?? config.config.check?.failOn ?? []);
  return { ok: true, diagram, report: { map: run, base, head: head ?? null, mergeBase: shared, ...delta, ...outcome } };
}
