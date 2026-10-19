// Debouncing and decisions behind the candidate watcher (FR-WAT-01, FR-CMP-08). No `vscode`
// import, so the rules are unit-tested in Node; watcher.ts wires them to FileSystemWatchers.

export const DEBOUNCE_MS = 300;
export const DELETED_MESSAGE = "This diagram was deleted.";
/** Status bar text when the baseline candidate disappears (FR-CMP-08). */
export const BASELINE_DELETED_MESSAGE = "Baseline diagram was deleted; showing no comparison.";

/**
 * Collects file events and calls `flush` once no event arrived for {@link DEBOUNCE_MS}. A file
 * counts as created when any of its batched events was a creation.
 */
export class ChangeBatch {
  private readonly pending = new Map<string, boolean>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly flush: (changes: ReadonlyMap<string, boolean>) => void) {}

  add(file: string, created: boolean): void {
    this.pending.set(file, created || this.pending.get(file) === true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const changes = new Map(this.pending);
      this.pending.clear();
      this.flush(changes);
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.pending.clear();
  }
}

/** One debounced change, with the facts needed to decide what to do. */
export interface CandidateChange {
  file: string;
  /** A creation was among the batched events. */
  created: boolean;
  /** The file exists after the batch. */
  exists: boolean;
  /** Repo root (workspace folder) the file belongs to. */
  root: string;
  /** Newest candidate of that root after the batch (FR-VIEW-02), if any. */
  newest: string | undefined;
}

export type WatchAction =
  | { kind: "reload" }
  | { kind: "deleted" }
  | { kind: "baselineChanged" }
  | { kind: "baselineDeleted" }
  | { kind: "switch"; root: string; file: string }
  | { kind: "notify"; root: string; file: string };

/** What the watcher needs to know about the open panel. */
export interface PanelFacts {
  root: string;
  file: string;
  /** The baseline `candidate.json` (FR-CMP-05), or `null` without a comparison. */
  baseline: string | null;
}

/**
 * What to do for one change, given the panel's state (`undefined` when no panel is open):
 * - the panel's file changed → reload it (viewport kept); deleted → empty state;
 * - the panel's baseline changed → re-send the comparison; deleted → drop the baseline;
 * - a new candidate that is now the newest of its folder → load it into a panel open for that
 *   folder (with its default baseline), otherwise offer it in a notification;
 * - anything else → nothing.
 */
export function watchAction(change: CandidateChange, panel: PanelFacts | undefined): WatchAction | undefined {
  if (panel && change.file === panel.file) return change.exists ? { kind: "reload" } : { kind: "deleted" };
  if (panel && change.file === panel.baseline) return change.exists ? { kind: "baselineChanged" } : { kind: "baselineDeleted" };
  if (!change.exists || !change.created || change.newest !== change.file) return undefined;
  if (panel && panel.root === change.root) return { kind: "switch", root: change.root, file: change.file };
  return { kind: "notify", root: change.root, file: change.file };
}
