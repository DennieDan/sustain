// The change map of an update run (FR-UPD-02, FR-UPD-03): mode decision, diff parsing, mapping
// of changed files to the previous diagram's components and the `change.md` / `mapping.md`
// renderings. Ported from the change collection study's `harness/change-input.mjs` and
// `harness/lib/diff.mjs`. Pure: git output and file reads come in as strings or callbacks.
import { isDenied } from "./deny";
import type { Lineage } from "./lineage";
import { isJsonObject } from "./types";

/** Updates allowed before the next run regenerates (U4, ADR 0029). */
export const MAX_UPDATES = 5;
/** Largest `change.md`, in UTF-8 bytes. */
export const MAX_CHANGE_BYTES = 2 * 1024 * 1024;
/** A previous run with more uncommitted paths than this has an unknown baseline (FR-GIT-01 cap). */
export const MAX_BASELINE_DIRTY = 200;
/** Sustain's run folders live here (runFolder.ts `ARCHIFY_DIR`; that module uses Node APIs). */
const OWN_OUTPUT_DIR = ".archify";

export type RegenerateReason =
  | "requested"
  | "no-previous"
  | "no-git"
  | "no-base-revision"
  | "dirty-baseline"
  | "base-unreachable"
  | "scheduled"
  | "change-too-large";

export type ModeDecision = { mode: "update"; reason: "update"; base: string } | { mode: "regenerate"; reason: RegenerateReason; base: string | null };

export interface ModeFacts {
  /** `--regenerate` was given. */
  requested: boolean;
  /** A previous candidate of the same scope exists. */
  hasPrevious: boolean;
  /** FR-GIT-01 facts are available now. */
  hasGit: boolean;
  /** `lineage.json` of the previous run, if any. */
  previousLineage: Lineage | null;
  /** `meta.repository.revision` of the previous candidate, if any. */
  candidateRevision: string | null;
  /** Whether a base commit is in the object store and an ancestor of HEAD. */
  baseReachable(base: string): boolean;
}

/**
 * FR-UPD-02 rows in order, except `change-too-large`, which needs the rendered change.
 * The base is the previous lineage's `revision`, else the candidate's `meta.repository.revision`.
 */
export function decideMode(facts: ModeFacts): ModeDecision {
  const base = facts.previousLineage?.revision ?? facts.candidateRevision ?? null;
  const regenerate = (reason: RegenerateReason): ModeDecision => ({ mode: "regenerate", reason, base });
  if (facts.requested) return regenerate("requested");
  if (!facts.hasPrevious) return regenerate("no-previous");
  if (!facts.hasGit) return regenerate("no-git");
  if (base === null) return regenerate("no-base-revision");
  if (facts.previousLineage !== null && facts.previousLineage.dirtyCount > MAX_BASELINE_DIRTY) return regenerate("dirty-baseline");
  if (!facts.baseReachable(base)) return regenerate("base-unreachable");
  if (facts.previousLineage !== null && facts.previousLineage.updatesSinceRegeneration >= MAX_UPDATES) return regenerate("scheduled");
  return { mode: "update", reason: "update", base };
}

/** A component of the previous diagram, reduced to what the change map needs. */
export interface MapComponent {
  id: string;
  label: string;
  /** Cited `sources[].path` values. */
  paths: Set<string>;
}

/** The components of a parsed candidate; entries without a string `id` are skipped. */
export function diagramComponents(value: unknown): MapComponent[] {
  if (!isJsonObject(value) || !Array.isArray(value["components"])) return [];
  const out: MapComponent[] = [];
  for (const component of value["components"]) {
    if (!isJsonObject(component) || typeof component["id"] !== "string") continue;
    const id = component["id"];
    const label = typeof component["label"] === "string" ? component["label"] : id;
    const sources = Array.isArray(component["sources"]) ? component["sources"] : [];
    const paths = new Set(sources.flatMap((source) => (isJsonObject(source) && typeof source["path"] === "string" ? [source["path"]] : [])));
    out.push({ id, label, paths });
  }
  return out;
}

/** `meta.repository.revision` of a parsed candidate, or `null`. */
export function candidateRevision(value: unknown): string | null {
  if (!isJsonObject(value) || !isJsonObject(value["meta"]) || !isJsonObject(value["meta"]["repository"])) return null;
  const revision = value["meta"]["repository"]["revision"];
  return typeof revision === "string" ? revision : null;
}

export interface Hunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

/** One file of a unified diff; `text` is what `change.md` shows for it. */
export interface FileDiff {
  oldPath: string | null;
  newPath: string | null;
  text: string;
  hunks: Hunk[];
  /** Why the content is not shown, for files listed by name only. */
  note?: string;
}

/** One `--name-status` entry; renames and copies carry `oldPath`. */
export interface NameStatus {
  status: string;
  path: string;
  oldPath?: string;
}

const C_ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };

/** Undoes git's C-style quoting of a path (`"dir/\303\251.txt"`); unquoted paths are returned unchanged. */
export function unquotePath(path: string): string {
  if (!(path.length >= 2 && path.startsWith('"') && path.endsWith('"'))) return path;
  const bytes: number[] = [];
  const body = path.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]!;
    if (ch !== "\\") {
      bytes.push(...new TextEncoder().encode(ch));
      continue;
    }
    const next = body[i + 1] ?? "";
    const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
    if (octal) {
      bytes.push(parseInt(octal[0], 8));
      i += 3;
    } else {
      bytes.push(C_ESCAPES[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** A `---`/`+++`/`rename`/`copy` header path: unquoted, prefix removed, git's trailing tab dropped. */
function headerPath(raw: string, prefix: string): string {
  const path = unquotePath(raw.replace(/\t$/, ""));
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** Splits a unified diff made with `a/` and `b/` prefixes into per-file sections. */
export function splitDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const chunks = raw.split(/^(?=diff --git )/m).filter((chunk) => chunk.startsWith("diff --git "));
  for (const text of chunks) {
    const lines = text.split("\n");
    let oldPath: string | null | undefined;
    let newPath: string | null | undefined;
    const hunks: Hunk[] = [];
    for (const line of lines) {
      if (line.startsWith("rename from ")) oldPath = headerPath(line.slice("rename from ".length), "");
      else if (line.startsWith("rename to ")) newPath = headerPath(line.slice("rename to ".length), "");
      else if (line.startsWith("copy from ")) oldPath = headerPath(line.slice("copy from ".length), "");
      else if (line.startsWith("copy to ")) newPath = headerPath(line.slice("copy to ".length), "");
      else if (line.startsWith("--- ") && oldPath === undefined) oldPath = line === "--- /dev/null" ? null : headerPath(line.slice(4), "a/");
      else if (line.startsWith("+++ ") && newPath === undefined) newPath = line === "+++ /dev/null" ? null : headerPath(line.slice(4), "b/");
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        hunks.push({
          header: line,
          oldStart: Number(hunk[1]),
          oldLines: hunk[2] === undefined ? 1 : Number(hunk[2]),
          newStart: Number(hunk[3]),
          newLines: hunk[4] === undefined ? 1 : Number(hunk[4]),
        });
      }
    }
    if (oldPath === undefined || newPath === undefined) {
      // Binary or mode-only change without ---/+++ lines: `diff --git a/P b/P`.
      const header = (lines[0] ?? "").slice("diff --git ".length);
      let path: string | null = null;
      const quoted = /^"(a\/(?:[^"\\]|\\.)*)" "(b\/(?:[^"\\]|\\.)*)"$/.exec(header);
      if (quoted) {
        const [left, right] = [unquotePath(`"${quoted[1]}"`).slice(2), unquotePath(`"${quoted[2]}"`).slice(2)];
        if (left === right) path = left;
      } else {
        const half = (header.length - 1) / 2;
        const left = header.slice(0, half);
        const right = header.slice(half + 1);
        if (left.startsWith("a/") && right.startsWith("b/") && left.slice(2) === right.slice(2)) path = left.slice(2);
      }
      if (oldPath === undefined) oldPath = /^new file mode/m.test(text) ? null : path;
      if (newPath === undefined) newPath = /^deleted file mode/m.test(text) ? null : path;
    }
    files.push({ oldPath: oldPath ?? null, newPath: newPath ?? null, text, hunks });
  }
  return files;
}

/** Parses `git diff --name-status -z`: `S\0path\0`, or `R<score>\0old\0new\0` for renames and copies. */
export function parseNameStatusZ(output: string): NameStatus[] {
  const fields = output.split("\0");
  const entries: NameStatus[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const status = fields[i]!;
    if (status === "") continue;
    if (/^[RC]/.test(status)) {
      const oldPath = fields[i + 1];
      const path = fields[i + 2];
      i += 2;
      if (oldPath && path) entries.push({ status, path, oldPath });
    } else {
      const path = fields[i + 1];
      i += 1;
      if (path) entries.push({ status, path });
    }
  }
  return entries;
}

/** Touched files (§4 glossary): every listed path; a rename touches both paths. */
export function touchedFiles(entries: readonly NameStatus[]): Set<string> {
  const out = new Set<string>();
  for (const entry of entries) {
    out.add(entry.path);
    if (entry.oldPath) out.add(entry.oldPath);
  }
  return out;
}

/** Sustain's own output under the repo-root `.archify/` folder, never part of the change. */
function isOwnOutput(path: string | null | undefined): boolean {
  return path === OWN_OUTPUT_DIR || (path?.startsWith(`${OWN_OUTPUT_DIR}/`) ?? false);
}

/** A file section listed by name only. */
export function nameOnlyDiff(oldPath: string | null, newPath: string | null, note: string): FileDiff {
  const a = oldPath ?? newPath ?? "";
  const b = newPath ?? oldPath ?? "";
  const lines = [`diff --git a/${a} b/${b}`];
  if (oldPath === null) lines.push("new file");
  else if (newPath === null) lines.push("deleted file");
  else if (oldPath !== newPath) lines.push(`rename from ${oldPath}`, `rename to ${newPath}`);
  lines.push(`(${note})`);
  return { oldPath, newPath, text: `${lines.join("\n")}\n`, hunks: [], note };
}

/** The diff of an untracked file against nothing: one hunk adding `content`. */
export function addedFileDiff(path: string, content: string): FileDiff {
  const lines = content.split("\n");
  const trailingNewline = content.endsWith("\n");
  if (trailingNewline) lines.pop();
  const count = content === "" ? 0 : lines.length;
  const head = [`diff --git a/${path} b/${path}`, "new file (untracked)", "--- /dev/null", `+++ b/${path}`];
  if (count === 0) return { oldPath: null, newPath: path, text: `${head.join("\n")}\n`, hunks: [] };
  const header = `@@ -0,0 +1${count === 1 ? "" : `,${count}`} @@`;
  const body = lines.map((line) => `+${line}`);
  if (!trailingNewline) body.push("\\ No newline at end of file");
  return {
    oldPath: null,
    newPath: path,
    text: `${[...head, header, ...body].join("\n")}\n`,
    hunks: [{ header, oldStart: 0, oldLines: 0, newStart: 1, newLines: count }],
  };
}

const NOTE_DENIED = "path on the citation deny-list; content not shown";
const NOTE_BINARY = "binary file; content not shown";
const NOTE_UNREADABLE = "untracked; content not shown";
const NOTE_PREVIOUSLY_DIRTY = "uncommitted when the previous diagram was drawn; compare with the current file";

export interface ChangeInput {
  /** `git diff --name-status -z <base>` */
  nameStatus: string;
  /** `git diff --unified=3 <base>` with `a/`/`b/` prefixes */
  diff: string;
  /** `git ls-files -z --others --exclude-standard` */
  untracked: string;
  /** The previous lineage's `dirty` list (directories end in `/`). */
  previousDirty: readonly string[];
  /** Every path the previous diagram cites. */
  cited: ReadonlySet<string>;
  /** Whether `path` exists in the working tree now. */
  exists(path: string): boolean;
  /** Text content of an untracked file, or `null` when it is binary, too large or unreadable. */
  readUntracked(path: string): string | null;
}

export interface ChangeSet {
  fileDiffs: FileDiff[];
  entries: NameStatus[];
}

/**
 * Base → working tree changes (FR-UPD-03): the diff, untracked files as added, previously
 * dirty paths as modified (deleted when gone). Deny-listed and binary files keep only their
 * names; Sustain's own `.archify/` output is left out.
 */
export function collectChanges(input: ChangeInput): ChangeSet {
  const entries = parseNameStatusZ(input.nameStatus).filter((entry) => !isOwnOutput(entry.path) && !isOwnOutput(entry.oldPath));
  const fileDiffs = splitDiff(input.diff).filter((diff) => !isOwnOutput(diff.oldPath) && !isOwnOutput(diff.newPath));
  const known = touchedFiles(entries);

  for (const path of input.untracked.split("\0")) {
    if (path === "" || isOwnOutput(path) || known.has(path)) continue;
    known.add(path);
    entries.push({ status: "A", path });
    if (!input.cited.has(path)) continue;
    const content = isDenied(path) ? null : input.readUntracked(path);
    fileDiffs.push(content === null ? nameOnlyDiff(null, path, NOTE_UNREADABLE) : addedFileDiff(path, content));
  }

  for (const dirty of input.previousDirty) {
    if (isOwnOutput(dirty)) continue;
    // An untracked folder (`dir/`) matters only through the cited files below it.
    const paths = dirty.endsWith("/") ? [...input.cited].filter((path) => path.startsWith(dirty)).sort() : [dirty];
    for (const path of paths) {
      if (known.has(path)) continue;
      known.add(path);
      const exists = input.exists(path);
      entries.push({ status: exists ? "M" : "D", path });
      if (input.cited.has(path)) fileDiffs.push(nameOnlyDiff(path, exists ? path : null, NOTE_PREVIOUSLY_DIRTY));
    }
  }

  const shown = fileDiffs.map((diff) => {
    if (diff.note !== undefined) return diff;
    if ((diff.oldPath !== null && isDenied(diff.oldPath)) || (diff.newPath !== null && isDenied(diff.newPath))) {
      return nameOnlyDiff(diff.oldPath, diff.newPath, NOTE_DENIED);
    }
    if (/^(Binary files .* differ|GIT binary patch)$/m.test(diff.text)) return nameOnlyDiff(diff.oldPath, diff.newPath, NOTE_BINARY);
    return diff;
  });
  return { fileDiffs: shown, entries };
}

export interface ChangeMap {
  touchedComponents: { id: string; label: string; diffs: FileDiff[] }[];
  untouched: { id: string; label: string }[];
  uncited: NameStatus[];
}

/** Groups the per-file diffs by the components whose cited files they touch (file level). */
export function mapChanges(components: readonly MapComponent[], changes: ChangeSet): ChangeMap {
  const cited = new Set(components.flatMap((component) => [...component.paths]));
  const touchedComponents: ChangeMap["touchedComponents"] = [];
  const untouched: ChangeMap["untouched"] = [];
  for (const component of components) {
    const diffs = changes.fileDiffs.filter(
      (diff) => (diff.oldPath !== null && component.paths.has(diff.oldPath)) || (diff.newPath !== null && component.paths.has(diff.newPath)),
    );
    if (diffs.length === 0) untouched.push({ id: component.id, label: component.label });
    else touchedComponents.push({ id: component.id, label: component.label, diffs });
  }
  const uncited = changes.entries.filter((entry) => !cited.has(entry.path) && !(entry.oldPath && cited.has(entry.oldPath)));
  return { touchedComponents, untouched, uncited };
}

const short = (sha: string): string => sha.slice(0, 7);

function fence(text: string, lang = ""): string {
  const body = text.endsWith("\n") || text === "" ? text : `${text}\n`;
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}${lang}\n${body}${ticks}\n`;
}

const diffName = (diff: FileDiff): string =>
  diff.oldPath && diff.newPath && diff.oldPath !== diff.newPath ? `${diff.oldPath} → ${diff.newPath}` : (diff.newPath ?? `${diff.oldPath} (deleted)`);

const entryName = (entry: NameStatus): string => (entry.oldPath ? `${entry.status}\t${entry.oldPath}\t${entry.path}` : `${entry.status}\t${entry.path}`);

/** `change.md`: the study's CI-C format, grouped by component. */
export function renderChange(base: string, head: string, map: ChangeMap): string {
  const out = [`# Code change from ${short(base)} to the working tree at ${short(head)}, grouped by diagram component`, ""];
  out.push("## Changed code by component", "");
  if (map.touchedComponents.length === 0) out.push("No component's cited files changed.", "");
  for (const component of map.touchedComponents) {
    out.push(`### \`${component.id}\` (${component.label})`, "");
    out.push(fence(component.diffs.map((diff) => diff.text).join(""), "diff"));
  }
  out.push("## Changed files that no component cites", "");
  out.push(map.uncited.length === 0 ? "None.\n" : fence(map.uncited.map(entryName).join("\n")));
  return out.join("\n");
}

/** `mapping.md`: the study's S4 mapping of changed files to the previous diagram's components. */
export function renderMapping(base: string, head: string, map: ChangeMap): string {
  const out = [`# Changed files mapped to the components of the previous diagram (${short(base)} → working tree at ${short(head)})`, ""];
  out.push("## Components whose cited files changed", "");
  if (map.touchedComponents.length === 0) out.push("None.", "");
  for (const component of map.touchedComponents) {
    out.push(`- \`${component.id}\` (${component.label})`);
    for (const diff of component.diffs) {
      const hunks = diff.hunks.map((hunk) => hunk.header.replace(/^(@@[^@]*@@).*$/, "$1")).join(", ");
      const detail = hunks ? `: ${hunks}` : diff.note ? ` (${diff.note})` : "";
      out.push(`  - ${diffName(diff)}${detail}`);
    }
  }
  out.push("", "## Components whose cited files did not change", "");
  out.push(map.untouched.length === 0 ? "None." : map.untouched.map((component) => `- \`${component.id}\` (${component.label})`).join("\n"));
  out.push("", "## Changed files that no component cites", "");
  out.push(map.uncited.length === 0 ? "None." : fence(map.uncited.map(entryName).join("\n")));
  return `${out.join("\n")}\n`;
}
