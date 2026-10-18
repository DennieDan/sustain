// Citation checks (FR-VAL-05), ported from the prototype's `archalign-model/src/citations.rs`,
// `archalign-repo/src/citations.rs` and `archalign-repo/src/text.rs`. Deviations: ADR 0019.
import { closeSync, openSync, readSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { citationPathOk, MAX_PATH_LENGTH } from "./citationPath";
import { isDenied } from "./deny";
import type { ArchifyDoc, Issue, SourceRef } from "./types";

/** Largest citable file: 2 MiB. */
export const MAX_CITED_BYTES = 2 * 1024 * 1024;
/** Leading bytes searched for a NUL byte. */
export const BINARY_SNIFF_BYTES = 8 * 1024;
export { citationPathOk, MAX_PATH_LENGTH } from "./citationPath";

/** Lines in `bytes`; a trailing newline does not start an extra line (`""` 0, `"a\n"` 1, `"a\nb"` 2). */
export function countLines(bytes: Uint8Array): number {
  let newlines = 0;
  for (const byte of bytes) if (byte === 0x0a) newlines += 1;
  if (bytes.length === 0) return 0;
  return bytes[bytes.length - 1] === 0x0a ? newlines : newlines + 1;
}

/** What is at a syntactically valid citation path. */
export type FileProbe =
  | { kind: "text"; lineCount: number }
  | { kind: "outside" }
  | { kind: "missing" }
  | { kind: "notFile" }
  | { kind: "tooLarge"; size: number }
  | { kind: "binary" }
  | { kind: "unreadable"; reason: string };

/**
 * Resolves `path` (already accepted by {@link citationPathOk}) against `rootReal`, the real
 * path of the repo root, following symlinks, and classifies the target.
 */
export function probeFile(rootReal: string, path: string): FileProbe {
  let real: string;
  try {
    real = realpathSync(join(rootReal, ...path.split("/")));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    return { kind: "unreadable", reason: (error as Error).message };
  }
  if (real !== rootReal && !real.startsWith(rootReal.endsWith(sep) ? rootReal : rootReal + sep)) {
    return { kind: "outside" };
  }
  let fd: number | undefined;
  try {
    const stat = statSync(real);
    if (!stat.isFile()) return { kind: "notFile" };
    if (stat.size > MAX_CITED_BYTES) return { kind: "tooLarge", size: stat.size };
    // Read at most one byte past the limit: the file may grow after `stat`.
    const buffer = Buffer.alloc(Math.min(stat.size, MAX_CITED_BYTES) + 1);
    fd = openSync(real, "r");
    let length = 0;
    while (length < buffer.length) {
      const read = readSync(fd, buffer, length, buffer.length - length, length);
      if (read === 0) break;
      length += read;
    }
    if (length > MAX_CITED_BYTES) return { kind: "tooLarge", size: length };
    const bytes = buffer.subarray(0, length);
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return { kind: "binary" };
    return { kind: "text", lineCount: countLines(bytes) };
  } catch (error) {
    return { kind: "unreadable", reason: (error as Error).message };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Whether an answer may link to `path` (UI-06): the same path rule, deny-list and confinement as
 * a map citation, and a readable text file.
 */
export function citable(rootReal: string, path: string): boolean {
  return citationPathOk(path) && !isDenied(path) && probeFile(rootReal, path).kind === "text";
}

function lines(count: number): string {
  return count === 1 ? "1 line" : `${count} lines`;
}

/** The first line-range problem of `source` in a file of `lineCount` lines, as `[field, message]`. */
export function rangeProblem(source: SourceRef, lineCount: number): ["line" | "end_line", string] | null {
  const { path, line, end_line: end } = source;
  const has = `${path} has ${lines(lineCount)}`;
  if (line !== undefined && line < 1) return ["line", `Cited line ${line} is invalid; lines start at 1 (${has})`];
  if (end !== undefined && line === undefined) {
    return ["end_line", `Cited end_line ${end} needs a start \`line\` (${has})`];
  }
  if (line !== undefined && line > lineCount) {
    const cited = end !== undefined ? `lines ${line}–${end}` : `line ${line}`;
    return ["line", `Cited ${cited} outside the file: ${has}`];
  }
  if (line !== undefined && end !== undefined) {
    if (end < line) return ["end_line", `Cited range ends at line ${end}, before its first line ${line} (${has})`];
    if (end > lineCount) return ["end_line", `Cited lines ${line}–${end} outside the file: ${has}`];
  }
  return null;
}

function probeMessage(path: string, probe: Exclude<FileProbe, { kind: "text" }>): string {
  switch (probe.kind) {
    case "outside":
      return `${path} resolves outside the repository root`;
    case "missing":
      return `${path} does not exist`;
    case "notFile":
      return `${path} is not a regular file`;
    case "tooLarge":
      return `${path} is too large to cite (${probe.size} bytes; the limit is 2 MiB)`;
    case "binary":
      return `${path} is a binary file (NUL byte in its first 8 KiB)`;
    case "unreadable":
      return `${path} cannot be read: ${probe.reason}`;
  }
}

/**
 * Checks every `components[i].sources[k]` of a schema-valid document against the repo at
 * `root`: path syntax, deny-list, resolution inside the root, file kind and size, lines.
 * Each distinct path is probed once.
 */
export function checkCitations(doc: ArchifyDoc, root: string): Issue[] {
  const rootReal = realpathSync(root);
  const cache = new Map<string, FileProbe>();
  const issues: Issue[] = [];
  doc.components.forEach((component, i) => {
    (component.sources ?? []).forEach((source, k) => {
      const base = `/components/${i}/sources/${k}`;
      const { path } = source;
      if (!citationPathOk(path)) {
        issues.push({
          code: "InvalidCitationPath",
          pointer: `${base}/path`,
          message: `\`${path}\` is not a valid repository-relative path (at most ${MAX_PATH_LENGTH} characters, \`/\` separators, no empty, \`.\` or \`..\` segments, not absolute)`,
        });
        return;
      }
      if (isDenied(path)) {
        issues.push({ code: "DeniedCitation", pointer: `${base}/path`, message: `${path} is on the deny-list and cannot be cited` });
        return;
      }
      let probe = cache.get(path);
      if (!probe) {
        probe = probeFile(rootReal, path);
        cache.set(path, probe);
      }
      if (probe.kind !== "text") {
        issues.push({ code: "BrokenCitation", pointer: `${base}/path`, message: probeMessage(path, probe) });
        return;
      }
      const problem = rangeProblem(source, probe.lineCount);
      if (problem) issues.push({ code: "BrokenCitation", pointer: `${base}/${problem[0]}`, message: problem[1] });
    });
  });
  return issues;
}
