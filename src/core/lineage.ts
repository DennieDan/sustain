// The shape of `<run folder>/lineage.json` (FR-UPD-04): which run this one updates, the commit it
// was drawn at and how many updates happened since the last regeneration. `src/core-node/lineage.ts`
// reads and writes the file.

export type RunMode = "update" | "regenerate";

/** One commit as `lineage.json` records it (FR-CMP-01). */
export interface CommitInfo {
  /** First line of the commit message. */
  subject: string;
  /** Committer date, ISO 8601 (`%cI`). */
  committedAt: string;
}

export interface Lineage {
  mode: RunMode;
  /** The FR-UPD-02 reason. */
  reason: string;
  /** Run folder name of the previous candidate, or `null`. */
  previousRun: string | null;
  /** Commit the change map was taken from, or `null`. */
  baseRevision: string | null;
  /** HEAD when this run started, or `null` without git facts. */
  revision: string | null;
  /** Subject and date of `baseRevision`, or `null` (FR-CMP-01). */
  baseCommit: CommitInfo | null;
  /** Subject and date of `revision`, or `null` (FR-CMP-01). */
  headCommit: CommitInfo | null;
  /** Uncommitted paths when this run started (FR-GIT-01, at most 200). */
  dirty: string[];
  /** Total number of uncommitted paths. */
  dirtyCount: number;
  updatesSinceRegeneration: number;
}
