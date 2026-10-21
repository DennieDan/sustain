// The context of a comparison (FR-CMP-04, ADR 0031): warnings, the approximate flag, whether the
// previous run's change data applies, and the commits to show. Browser-safe and pure: the host
// injects every fact read from disk.
import type { Lineage } from "../core-node/lineage";
import type { Repository } from "./types";

/** Facts about one run, read by the host. */
export interface RunFacts {
  /** Run folder name below `.archify/`. */
  runFolder: string;
  /** Slug from `RUN_FOLDER_PATTERN`, or `null` when the folder name does not match. */
  slug: string | null;
  /** Index in `listCandidates` (FR-VIEW-02); 0 is the newest. */
  order: number;
  lineage: Lineage | null;
  /** `meta.repository` of the candidate, or `null`. */
  repository: Repository | null;
  /** Component IDs the tolerant parse kept. */
  componentIds: readonly string[];
}

export type WarningCode = "different-focus" | "unrelated" | "different-repository" | "outside-history" | "reversed";

export interface ComparisonWarning {
  code: WarningCode;
  message: string;
}

/** A commit as the header shows it. */
export interface CommitRef {
  /** 40-hex revision. */
  revision: string;
  subject: string | null;
  committedAt: string | null;
  /** Uncommitted paths when the run started; 0 when unknown. */
  dirtyCount: number;
}

export interface ComparisonContext {
  baselineRun: string;
  currentRun: string;
  warnings: ComparisonWarning[];
  approximate: boolean;
  /** "Code changed, kept" and "Not in any component" apply (FR-CMP-04). */
  keptAvailable: boolean;
  /**
   * Show "available only when comparing with the previous run" instead of the kept and uncited
   * sections: `!keptAvailable`, except when the open run is a regenerate run compared with its
   * own `previousRun` (the approximate label covers that case).
   */
  keptNote: boolean;
  /** `null` = unknown revision. */
  baselineCommit: CommitRef | null;
  currentCommit: CommitRef | null;
}

/** Below this share of matching component IDs the runs are probably unrelated. */
export const UNRELATED_THRESHOLD = 0.3;
/** The update-history walk stops after this many `previousRun` steps. */
export const MAX_HISTORY_STEPS = 1000;

interface History {
  /** Run folders reached from the open run by `previousRun`, without the open run. */
  runs: Set<string>;
  /** Whether any run from the open run down to `target` (exclusive) is a regenerate run. */
  regenerateBeforeTarget: boolean;
}

/** Walks `previousRun` from `current`; stops at a visited run, a missing lineage or the step cap. */
function updateHistory(current: RunFacts, target: string, lineageOf: (runFolder: string) => Lineage | null): History {
  const runs = new Set<string>();
  const visited = new Set<string>([current.runFolder]);
  let regenerate = false;
  let regenerateBeforeTarget = false;
  let lineage = current.lineage;
  for (let step = 0; lineage && step < MAX_HISTORY_STEPS; step++) {
    const previous = lineage.previousRun;
    if (previous === null || visited.has(previous)) break;
    if (lineage.mode === "regenerate") regenerate = true;
    visited.add(previous);
    runs.add(previous);
    if (previous === target) regenerateBeforeTarget = regenerate;
    lineage = lineageOf(previous);
  }
  return { runs, regenerateBeforeTarget };
}

const differentFocus = (current: RunFacts, other: RunFacts): boolean => current.slug !== null && other.slug !== null && current.slug !== other.slug;

const outsideHistory = (current: RunFacts, other: RunFacts, history: History): boolean =>
  current.lineage !== null && other.lineage !== null && !history.runs.has(other.runFolder);

/** The commit the header shows for one side (FR-CMP-04); `null` = unknown revision. */
function commitRef(run: RunFacts): CommitRef | null {
  const { lineage, repository } = run;
  if (lineage && lineage.revision !== null) {
    return { revision: lineage.revision, subject: lineage.headCommit?.subject ?? null, committedAt: lineage.headCommit?.committedAt ?? null, dirtyCount: lineage.dirtyCount };
  }
  if (repository) return { revision: repository.revision, subject: null, committedAt: null, dirtyCount: lineage?.dirtyCount ?? 0 };
  return null;
}

/**
 * The context of comparing the open run `current` with `baseline` (FR-CMP-04). `lineageOf` looks
 * up other runs' lineages for the update-history walk; `changesParsed` says whether the open
 * run's `changes.json` parses.
 */
export function compareRuns(current: RunFacts, baseline: RunFacts, lineageOf: (runFolder: string) => Lineage | null, changesParsed: boolean): ComparisonContext {
  const history = updateHistory(current, baseline.runFolder, lineageOf);
  const warnings: ComparisonWarning[] = [];
  if (differentFocus(current, baseline)) {
    warnings.push({ code: "different-focus", message: `Different focus: \`${baseline.slug}\` vs \`${current.slug}\`.` });
  }
  const currentIds = new Set(current.componentIds);
  const union = new Set([...current.componentIds, ...baseline.componentIds]);
  const shared = [...new Set(baseline.componentIds)].filter((id) => currentIds.has(id)).length;
  if (union.size > 0 && shared / union.size < UNRELATED_THRESHOLD) {
    warnings.push({ code: "unrelated", message: `Probably unrelated: only ${shared} of ${union.size} components match.` });
  }
  const baselineUrl = baseline.repository?.url;
  const currentUrl = current.repository?.url;
  if (baselineUrl && currentUrl && baselineUrl !== currentUrl) {
    warnings.push({ code: "different-repository", message: `Different repository: \`${baselineUrl}\`.` });
  }
  const outside = outsideHistory(current, baseline, history);
  if (outside) warnings.push({ code: "outside-history", message: "Not in this diagram's update history." });
  if (baseline.order < current.order) {
    warnings.push({ code: "reversed", message: "Baseline is newer than this diagram; changes are shown in reverse." });
  }

  const isPrevious = current.lineage !== null && baseline.runFolder === current.lineage.previousRun;
  const keptAvailable = isPrevious && current.lineage?.mode === "update" && changesParsed;
  return {
    baselineRun: baseline.runFolder,
    currentRun: current.runFolder,
    warnings,
    approximate: (history.runs.has(baseline.runFolder) && history.regenerateBeforeTarget) || outside,
    keptAvailable,
    keptNote: !keptAvailable && !(isPrevious && current.lineage?.mode === "regenerate"),
    baselineCommit: commitRef(baseline),
    currentCommit: commitRef(current),
  };
}

/** Picker detail tags for candidate `other` against the open run (FR-CMP-06), in display order. */
export function pickerTags(current: RunFacts, other: RunFacts, lineageOf: (runFolder: string) => Lineage | null): string[] {
  const tags: string[] = [];
  if (current.lineage && other.runFolder === current.lineage.previousRun) tags.push("previous");
  if (other.order < current.order) tags.push("newer");
  if (differentFocus(current, other)) tags.push("different focus");
  if (outsideHistory(current, other, updateHistory(current, other.runFolder, lineageOf))) tags.push("outside update history");
  return tags;
}
