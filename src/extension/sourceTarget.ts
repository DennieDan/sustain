// What clicking a source does (FR-NAV-02, FR-NAV-03), decided without `vscode` so every rule
// is unit-tested in Node. Checked on click only, never on load (ADR 0012).
import { realpathSync } from "node:fs";
import { join } from "node:path";
import { citationPathOk, probeFile } from "../model/citations";
import type { SourceRef } from "../model/types";

/** 1-based inclusive line range to select. */
export interface LineRange {
  start: number;
  end: number;
}

export type SourceTarget =
  /** Nothing opens; show `message` as an error. */
  | { kind: "error"; message: string }
  /** Open `file`; select `lines` when given; show `warning` as an error after opening. */
  | { kind: "open"; file: string; lines?: LineRange; warning?: string };

function positiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isInteger(value) && value >= 1 ? value : undefined;
}

/**
 * Resolves `source` against the repo `root`:
 * - a path that is not repo-relative (absolute, `..`, backslashes, empty segments) or whose
 *   real path leaves the root → "Invalid source path";
 * - missing or not a regular file → "Stale reference: … no longer exists";
 * - lines beyond the file's line count → open without a selection plus "Stale reference: … has
 *   N lines; the diagram cites L–E";
 * - otherwise open with `line..end_line`, `line`, or no selection.
 */
export function resolveSource(root: string, source: SourceRef): SourceTarget {
  const { path } = source;
  if (!citationPathOk(path)) return { kind: "error", message: `Invalid source path: \`${path}\`` };
  const probe = probeFile(realpathSync(root), path);
  if (probe.kind === "outside") return { kind: "error", message: `Invalid source path: \`${path}\`` };
  if (probe.kind === "missing" || probe.kind === "notFile") {
    return { kind: "error", message: `Stale reference: \`${path}\` no longer exists` };
  }
  const file = join(root, ...path.split("/"));
  const line = positiveInteger(source.line);
  if (line === undefined) return { kind: "open", file };
  const end = Math.max(line, positiveInteger(source.end_line) ?? line);
  // Binary, oversized or unreadable files have no line count here; open them and let the
  // editor show what it can, with the cited lines selected if they exist.
  if (probe.kind === "text" && end > probe.lineCount) {
    const cited = source.end_line !== undefined ? `${line}–${source.end_line}` : `${line}`;
    return { kind: "open", file, warning: `Stale reference: \`${path}\` has ${probe.lineCount} lines; the diagram cites ${cited}` };
  }
  return { kind: "open", file, lines: { start: line, end } };
}
