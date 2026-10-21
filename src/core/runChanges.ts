// `<run folder>/changes.json` (FR-CMP-02): the change map of an update run as data, for the
// viewer's "Code changed, kept" and "Not in any component" sections. Browser-safe: types and
// pure functions only; reading and writing the file is in lineage.ts.
import type { ChangeMap, FileDiff } from "./changeMap";
import type { NameStatus } from "./gitFormat";
import { isRecord } from "./types";

/** Git status reduced to what the viewer shows: renames carry `oldPath`. */
export type FileStatus = "A" | "M" | "D" | "R";

export interface FileChange {
  status: FileStatus;
  path: string;
  /** Only for `R`. */
  oldPath?: string;
}

export interface RunChanges {
  /** The revision the change map was taken from. */
  baseRevision: string;
  /** HEAD of the run, or `null` without git facts. */
  revision: string | null;
  /** Components of the previous diagram whose cited files changed, in change-map order. */
  touchedComponents: { id: string; files: FileChange[] }[];
  /** Changed files no component of the previous diagram cites. */
  uncited: FileChange[];
}

const isStatus = (value: unknown): value is FileStatus => value === "A" || value === "M" || value === "D" || value === "R";

/** The well-formed file entries of `values`; `oldPath` is required for `R` and dropped otherwise. */
function parseFileChanges(values: unknown[]): FileChange[] {
  const out: FileChange[] = [];
  for (const value of values) {
    if (!isRecord(value)) continue;
    const { status, path, oldPath } = value;
    if (!isStatus(status) || typeof path !== "string" || path === "") continue;
    if (status !== "R") out.push({ status, path });
    else if (typeof oldPath === "string" && oldPath !== "") out.push({ status, path, oldPath });
  }
  return out;
}

/**
 * `changes.json` content, or `null` when its top-level shape is wrong. Malformed file entries
 * and touched components are skipped.
 */
export function parseRunChanges(value: unknown): RunChanges | null {
  if (!isRecord(value)) return null;
  const { baseRevision, revision, touchedComponents, uncited } = value;
  if (typeof baseRevision !== "string" || !(revision === null || typeof revision === "string")) return null;
  if (!Array.isArray(touchedComponents) || !Array.isArray(uncited)) return null;
  const touched: RunChanges["touchedComponents"] = [];
  for (const component of touchedComponents) {
    if (!isRecord(component) || typeof component["id"] !== "string" || !Array.isArray(component["files"])) continue;
    touched.push({ id: component["id"], files: parseFileChanges(component["files"]) });
  }
  return { baseRevision, revision, touchedComponents: touched, uncited: parseFileChanges(uncited) };
}

function fromDiff(diff: FileDiff): FileChange {
  if (diff.oldPath === null) return { status: "A", path: diff.newPath ?? "" };
  if (diff.newPath === null) return { status: "D", path: diff.oldPath };
  if (diff.oldPath !== diff.newPath) return { status: "R", path: diff.newPath, oldPath: diff.oldPath };
  return { status: "M", path: diff.newPath };
}

function fromNameStatus(entry: NameStatus): FileChange {
  if (entry.status.startsWith("R") && entry.oldPath) return { status: "R", path: entry.path, oldPath: entry.oldPath };
  if (entry.status.startsWith("C") || entry.status === "A") return { status: "A", path: entry.path };
  if (entry.status === "D") return { status: "D", path: entry.path };
  return { status: "M", path: entry.path };
}

/**
 * `changes.json` for an update run (FR-CMP-02): the same touched components, in the same order,
 * and the same uncited entries as the change map `change.md` and `mapping.md` are rendered from.
 */
export function buildRunChanges(map: ChangeMap, baseRevision: string, revision: string | null): RunChanges {
  return {
    baseRevision,
    revision,
    touchedComponents: map.touchedComponents.map((component) => ({ id: component.id, files: component.diffs.map(fromDiff) })),
    uncited: map.uncited.map(fromNameStatus),
  };
}
