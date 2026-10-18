// FRS-04, shared with PRC-01: what a diff touched, and which boxes it touched. Browser-safe.
// Hunks are compared on the old side, where the map's citations point.

/** A revision a user may type: no option-like start and no shell-special characters. */
export const REVISION_PATTERN = /^(?!-)[A-Za-z0-9._/~^@{}-]+$/;

/** `from..to` split into its revisions, or `null`. */
export function rangeOf(value: string): { from: string; to: string } | null {
  const parts = value.trim().split("..");
  if (parts.length !== 2 || !parts.every((part) => REVISION_PATTERN.test(part) && !part.startsWith("."))) return null;
  return { from: parts[0]!, to: parts[1]! };
}

export interface Hunk {
  /** First old line the hunk replaces; for a pure insertion, the line it follows. */
  oldStart: number;
  /** Old lines replaced; 0 for a pure insertion. */
  oldLines: number;
}

export interface FileChange {
  /** The path after the change. */
  path: string;
  /** The path before a rename or copy; the same as `path` otherwise. */
  oldPath: string;
  status: "added" | "deleted" | "modified" | "renamed";
  /** Empty for a binary change, a pure rename, or an untracked file. */
  hunks: Hunk[];
  /** Lines added, from the hunk headers; an untracked file's line count when known. */
  added?: number;
}

/** Undoes git's C-style quoting of a path with unusual characters. */
export function unquotePath(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  const bytes: number[] = [];
  const escapes: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
  for (let i = 1; i < raw.length - 1; i++) {
    const char = raw[i]!;
    if (char !== "\\") {
      bytes.push(...new TextEncoder().encode(char));
      continue;
    }
    const next = raw[i + 1]!;
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(raw.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(escapes[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

/** The two paths of a `diff --git a/x b/y` header, either of which may be quoted. */
function headerPaths(rest: string): [string, string] {
  let oldRaw: string;
  let newRaw: string;
  if (rest.startsWith('"')) {
    const end = /^"(?:[^"\\]|\\.)*"/.exec(rest)?.[0] ?? rest;
    oldRaw = end;
    newRaw = rest.slice(end.length + 1);
  } else {
    // An unquoted path has no special characters; the new path starts at the last " b/" or ' "b/'.
    const split = Math.max(rest.lastIndexOf(" b/"), rest.lastIndexOf(' "b/'));
    oldRaw = split < 0 ? rest : rest.slice(0, split);
    newRaw = split < 0 ? rest : rest.slice(split + 1);
  }
  const strip = (raw: string, prefix: string): string => {
    const path = unquotePath(raw);
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  };
  return [strip(oldRaw, "a/"), strip(newRaw, "b/")];
}

/** The path in a `--- a/x` or `+++ b/x` line, or `null` for `/dev/null`. */
function sidePath(line: string, prefix: "a/" | "b/"): string | null {
  const raw = unquotePath(line.slice(4).replace(/\t$/, ""));
  if (raw === "/dev/null") return null;
  return raw.startsWith(prefix) ? raw.slice(2) : raw;
}

/** The files and old-side hunks of `git diff --unified=0 -M --src-prefix=a/ --dst-prefix=b/` output. */
export function parseDiff(text: string): FileChange[] {
  const files: FileChange[] = [];
  let current: FileChange | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const [oldPath, path] = headerPaths(line.slice("diff --git ".length));
      current = { path, oldPath, status: "modified", hunks: [] };
      files.push(current);
    } else if (current === null) {
      continue;
    } else if (line.startsWith("rename from ")) {
      current.oldPath = unquotePath(line.slice("rename from ".length));
      current.status = "renamed";
    } else if (line.startsWith("rename to ")) {
      current.path = unquotePath(line.slice("rename to ".length));
    } else if (line.startsWith("new file mode")) {
      current.status = "added";
    } else if (line.startsWith("deleted file mode")) {
      current.status = "deleted";
    } else if (line.startsWith("--- ")) {
      const old = sidePath(line, "a/");
      if (old !== null) current.oldPath = old;
    } else if (line.startsWith("+++ ")) {
      const next = sidePath(line, "b/");
      if (next !== null) current.path = next;
      else current.path = current.oldPath;
    } else if (line.startsWith("@@ ")) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
      if (hunk) {
        current.hunks.push({ oldStart: Number(hunk[1]), oldLines: hunk[2] === undefined ? 1 : Number(hunk[2]) });
        current.added = (current.added ?? 0) + (hunk[3] === undefined ? 1 : Number(hunk[3]));
      }
    }
  }
  return files;
}

interface CitingComponent {
  id: string;
  sources: { path: string; line?: number; end_line?: number }[];
}

export interface ChangeMarks {
  /** Boxes with a cited range a hunk touches, or citing a whole file that changed. */
  strong: string[];
  /** Boxes citing a changed file outside the touched lines. */
  weak: string[];
  /** Changed files no box cites. */
  uncovered: string[];
}

/** Whether `hunk` changes any of lines `start`..`end`. A pure insertion counts when it falls inside them. */
function touches(hunk: Hunk, start: number, end: number): boolean {
  if (hunk.oldLines === 0) return hunk.oldStart >= start && hunk.oldStart < end;
  return hunk.oldStart <= end && hunk.oldStart + hunk.oldLines - 1 >= start;
}

/**
 * Whether `change` touches the cited lines. A whole-file citation is touched by any change. A
 * change without hunks (binary, untracked or added) touches every line, except a pure rename.
 */
function sourceTouched(source: CitingComponent["sources"][number], change: FileChange): boolean {
  if (source.line === undefined) return true;
  if (change.hunks.length === 0) return change.status !== "renamed";
  return change.hunks.some((hunk) => touches(hunk, source.line!, source.end_line ?? source.line!));
}

/** Marks each box by how the changes touch what it cites (FRS-04). */
export function markChanges(components: readonly CitingComponent[], changes: readonly FileChange[]): ChangeMarks {
  const byOldPath = new Map(changes.map((change) => [change.oldPath, change]));
  const cited = new Set<string>();
  const strong: string[] = [];
  const weak: string[] = [];
  for (const component of components) {
    let mark: "strong" | "weak" | null = null;
    for (const source of component.sources) {
      const change = byOldPath.get(source.path);
      cited.add(source.path);
      if (change === undefined) continue;
      if (sourceTouched(source, change)) mark = "strong";
      else mark ??= "weak";
    }
    if (mark === "strong") strong.push(component.id);
    else if (mark === "weak") weak.push(component.id);
  }
  const uncovered = changes.filter((change) => !cited.has(change.oldPath) && !cited.has(change.path)).map((change) => change.path);
  return { strong, weak, uncovered };
}
