// What clicking a source does (FR-NAV-02, FR-NAV-03), decided without `vscode` so every rule
// is unit-tested in Node. Checked on click only, never on load (ADR 0012).
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { citationPathOk } from "../model/citationPath";
import { probeFile } from "../model/citations";
import type { SourceRef } from "../model/types";

/** 1-based inclusive line range to select. */
export interface LineRange {
  start: number;
  end: number;
}

export type SourceTarget =
  /** Nothing opens. The path is `invalid` when it leaves the folder, and `missing` when it names no file. */
  | { kind: "error"; problem: "invalid" | "missing"; path: string }
  /** Open `file`; select `lines` when given. `stale` holds the file's line count and the cited lines when they lie beyond its end. */
  | { kind: "open"; file: string; lines?: LineRange; stale?: { lineCount: number; cited: string } };

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined;
}

/**
 * Resolves `source` against the repo `root`:
 * - a path that is not repo-relative (absolute, `..`, backslashes, empty segments) or whose
 *   real path leaves the root is `invalid`;
 * - a path that is missing or not a regular file is `missing`;
 * - lines beyond the file's line count open the file without a selection, with `stale` set;
 * - otherwise open with `line..end_line`, `line`, or no selection.
 */
export function resolveSource(root: string, source: SourceRef): SourceTarget {
  const { path } = source;
  if (!citationPathOk(path)) return { kind: "error", problem: "invalid", path };
  const probe = probeFile(realpathSync(root), path);
  if (probe.kind === "outside") return { kind: "error", problem: "invalid", path };
  if (probe.kind === "missing" || probe.kind === "notFile") {
    return { kind: "error", problem: "missing", path };
  }
  const file = join(root, ...path.split("/"));
  const line = positiveInteger(source.line);
  if (line === undefined) return { kind: "open", file };
  const end = Math.max(line, positiveInteger(source.end_line) ?? line);
  // Binary, oversized or unreadable files have no line count here; open them and let the
  // editor show what it can, with the cited lines selected if they exist.
  if (probe.kind === "text" && end > probe.lineCount) {
    const cited = source.end_line !== undefined ? `${line}–${source.end_line}` : `${line}`;
    return { kind: "open", file, stale: { lineCount: probe.lineCount, cited } };
  }
  return { kind: "open", file, lines: { start: line, end } };
}
