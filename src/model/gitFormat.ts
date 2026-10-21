// Git's text formats: revisions, quoted paths, `-z` name-status and porcelain output, and unified
// diffs made with `a/` and `b/` prefixes. Browser-safe.

/** A full commit name: 40 lowercase hex characters. */
const COMMIT = /^[0-9a-f]{40}$/;
/** A revision a user may type: no option-like start and no shell-special characters. */
const NAME = /^(?!-)[A-Za-z0-9._/~^@{}-]+$/;

/** `"commit"` takes only a full commit name. `"name"` takes any revision a user may type, such as `origin/main` or `HEAD~2`. */
export type RevisionKind = "commit" | "name";

/** Whether git may take `value` as a revision of `kind`. Neither kind can start like an option. */
export function isRevision(value: unknown, kind: RevisionKind): value is string {
  return typeof value === "string" && (kind === "commit" ? COMMIT : NAME).test(value);
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

/** One `--name-status` entry; renames and copies carry `oldPath`. */
export interface NameStatus {
  status: string;
  path: string;
  oldPath?: string;
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

/**
 * Parses `git status --porcelain=v1 -z`. Renames and copies are followed by their original
 * path, which is skipped: the new path is reported.
 */
export function parsePorcelainZ(output: string): string[] {
  const fields = output.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i]!;
    if (record.length < 4) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) i += 1;
  }
  return paths;
}

/** One `@@` header of a unified diff. A missing line count is 1. */
export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

/** One file's section of a unified diff, as its header lines name it. */
export interface DiffSection {
  /** The section's text, from its `diff --git` line on. */
  text: string;
  /** The old and new paths of the `diff --git` line, without their `a/` and `b/` prefixes. */
  headerPaths: [string, string];
  /** From `rename from`, `copy from` or `---`. `null` for `/dev/null`, `undefined` when no header line names it. */
  oldPath: string | null | undefined;
  /** From `rename to`, `copy to` or `+++`. `null` for `/dev/null`, `undefined` when no header line names it. */
  newPath: string | null | undefined;
  /** The section has a `rename from` line. */
  renamed: boolean;
  /** The section has a `new file mode` line. */
  added: boolean;
  /** The section has a `deleted file mode` line. */
  deleted: boolean;
  hunks: DiffHunk[];
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function withoutPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** The two paths of a `diff --git` line after `diff --git `, either of which may be quoted. */
function gitHeaderPaths(rest: string): [string, string] {
  // `a/P b/P` names one unquoted path twice. It is read by length, because P may hold " b/".
  const half = (rest.length - 1) / 2;
  if (Number.isInteger(half) && rest.startsWith("a/") && rest.slice(half, half + 3) === " b/" && rest.slice(2, half) === rest.slice(half + 3)) {
    return [rest.slice(2, half), rest.slice(half + 3)];
  }
  let oldRaw: string;
  let newRaw: string;
  if (rest.startsWith('"')) {
    oldRaw = /^"(?:[^"\\]|\\.)*"/.exec(rest)?.[0] ?? rest;
    newRaw = rest.slice(oldRaw.length + 1);
  } else {
    // An unquoted path has no special characters. The new path starts at the last " b/" or ' "b/'.
    const split = Math.max(rest.lastIndexOf(" b/"), rest.lastIndexOf(' "b/'));
    oldRaw = split < 0 ? rest : rest.slice(0, split);
    newRaw = split < 0 ? rest : rest.slice(split + 1);
  }
  return [withoutPrefix(unquotePath(oldRaw), "a/"), withoutPrefix(unquotePath(newRaw), "b/")];
}

/** A header line's path: unquoted, git's trailing tab dropped and `prefix` removed. `null` for `/dev/null`. */
function headerLinePath(raw: string, prefix: string): string | null {
  const path = unquotePath(raw.replace(/\t$/, ""));
  return path === "/dev/null" ? null : withoutPrefix(path, prefix);
}

/** Splits a unified diff made with `a/` and `b/` prefixes into per-file sections. Only the lines before the first hunk name paths. */
export function parseDiffSections(diff: string): DiffSection[] {
  const sections: DiffSection[] = [];
  for (const text of diff.split(/^(?=diff --git )/m)) {
    if (!text.startsWith("diff --git ")) continue;
    const lines = text.split("\n");
    const section: DiffSection = {
      text,
      headerPaths: gitHeaderPaths(lines[0]!.slice("diff --git ".length)),
      oldPath: undefined,
      newPath: undefined,
      renamed: false,
      added: false,
      deleted: false,
      hunks: [],
    };
    for (const line of lines.slice(1)) {
      const hunk = HUNK_HEADER.exec(line);
      if (hunk) {
        section.hunks.push({
          header: line,
          oldStart: Number(hunk[1]),
          oldLines: hunk[2] === undefined ? 1 : Number(hunk[2]),
          newStart: Number(hunk[3]),
          newLines: hunk[4] === undefined ? 1 : Number(hunk[4]),
        });
      } else if (section.hunks.length > 0) {
        continue;
      } else if (line.startsWith("rename from ")) {
        section.oldPath = headerLinePath(line.slice("rename from ".length), "");
        section.renamed = true;
      } else if (line.startsWith("rename to ")) {
        section.newPath = headerLinePath(line.slice("rename to ".length), "");
      } else if (line.startsWith("copy from ")) {
        section.oldPath = headerLinePath(line.slice("copy from ".length), "");
      } else if (line.startsWith("copy to ")) {
        section.newPath = headerLinePath(line.slice("copy to ".length), "");
      } else if (line.startsWith("new file mode")) {
        section.added = true;
      } else if (line.startsWith("deleted file mode")) {
        section.deleted = true;
      } else if (line.startsWith("--- ") && section.oldPath === undefined) {
        section.oldPath = headerLinePath(line.slice(4), "a/");
      } else if (line.startsWith("+++ ") && section.newPath === undefined) {
        section.newPath = headerLinePath(line.slice(4), "b/");
      }
    }
    sections.push(section);
  }
  return sections;
}
