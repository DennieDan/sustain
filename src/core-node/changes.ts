// FRS-04, shared with PRC-01: what a diff touched, and which boxes it touched. Browser-safe.
// Hunks are compared on the old side, where the map's citations point.
import { isRevision, parseDiffSections } from "../core/gitFormat";

/** `from..to` split into its revisions, or `null`. */
export function rangeOf(value: string): { from: string; to: string } | null {
  const parts = value.trim().split("..");
  if (parts.length !== 2 || !parts.every((part) => isRevision(part, "name") && !part.startsWith("."))) return null;
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

/** The files and old-side hunks of `git diff --unified=0 -M --src-prefix=a/ --dst-prefix=b/` output. */
export function parseDiff(text: string): FileChange[] {
  return parseDiffSections(text).map((section) => {
    const [headerOld, headerNew] = section.headerPaths;
    const oldPath = section.oldPath ?? headerOld;
    const path = section.newPath === null ? oldPath : (section.newPath ?? headerNew);
    const status = section.deleted ? "deleted" : section.added ? "added" : section.renamed ? "renamed" : "modified";
    const change: FileChange = { path, oldPath, status, hunks: section.hunks.map(({ oldStart, oldLines }) => ({ oldStart, oldLines })) };
    if (section.hunks.length > 0) change.added = section.hunks.reduce((sum, hunk) => sum + hunk.newLines, 0);
    return change;
  });
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
