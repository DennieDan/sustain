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

/** What happens to one open viewer when a diagram file changed. */
export type ViewerAction = "reload" | "deleted" | "baselineChanged" | "baselineDeleted";

/** What the watcher needs to know about an open viewer. */
export interface ViewerFacts {
  root: string;
  file: string;
  /** The baseline diagram file (FR-CMP-05), or `null` without a comparison. */
  baseline: string | null;
  /** The viewer's tab is the visible one of its group. */
  visible: boolean;
}

/**
 * What one viewer does about a change: its file changed → reload it (viewport kept); deleted →
 * empty state; its baseline changed → re-send the comparison; deleted → drop the baseline.
 */
export function viewerAction(change: CandidateChange, viewer: ViewerFacts): ViewerAction | undefined {
  if (change.file === viewer.file) return change.exists ? "reload" : "deleted";
  if (change.file === viewer.baseline) return change.exists ? "baselineChanged" : "baselineDeleted";
  return undefined;
}

/** A new newest run: open it in the group of `viewers[viewer]`, or announce it. */
export type NewRunAction = { kind: "open"; viewer: number } | { kind: "notify" };

/**
 * What to do about a candidate that was created and is now the newest of its folder (FR-WAT-01):
 * nothing when a viewer already shows it; open it beside a viewer of the same folder (a visible
 * one first); otherwise announce it. Anything else → nothing.
 */
export function newRunAction(change: CandidateChange, viewers: readonly ViewerFacts[]): NewRunAction | undefined {
  if (!change.exists || !change.created || change.newest !== change.file) return undefined;
  if (viewers.some((viewer) => viewer.file === change.file)) return undefined;
  const sameRoot = viewers.flatMap((viewer, index) => (viewer.root === change.root ? [{ viewer, index }] : []));
  const target = sameRoot.find(({ viewer }) => viewer.visible) ?? sameRoot[0];
  return target ? { kind: "open", viewer: target.index } : { kind: "notify" };
}
