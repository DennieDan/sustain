// Debouncing and decisions behind the candidate watcher (FR-WAT-01). No `vscode` import, so
// the rules are unit-tested in Node; watcher.ts wires them to FileSystemWatchers.

export const DEBOUNCE_MS = 300;
export const DELETED_MESSAGE = "This diagram was deleted.";

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

/**
 * The `candidate.json` an event under `<root>/.archify/` concerns: the one in the run folder the
 * path lies in, or `undefined` for paths outside a run folder.
 */
export function candidateOf(archifyDir: string, path: string, sep: string): string | undefined {
  if (!path.startsWith(archifyDir + sep)) return undefined;
  const run = path.slice(archifyDir.length + sep.length).split(sep)[0];
  return run === undefined || run === "" ? undefined : `${archifyDir}${sep}${run}${sep}candidate.json`;
}

/**
 * Whether a candidate that `exists` now is new, judged against the candidates already `known`,
 * which it updates. File watchers can miss a file created inside a folder created a moment
 * before, so "new" comes from this comparison rather than from the event kind.
 */
export function noteCandidate(known: Set<string>, file: string, exists: boolean): boolean {
  if (!exists) {
    known.delete(file);
    return false;
  }
  if (known.has(file)) return false;
  known.add(file);
  return true;
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
  | { kind: "switch"; root: string; file: string }
  | { kind: "notify"; root: string; file: string };

/**
 * What to do for one change, given the panel's state (`undefined` when no panel is open):
 * - the panel's file changed → reload it (viewport kept); deleted → empty state;
 * - a new candidate that is now the newest of its folder → load it into a panel open for that
 *   folder, otherwise offer it in a notification;
 * - anything else → nothing.
 */
export function watchAction(change: CandidateChange, panel: { root: string; file: string } | undefined): WatchAction | undefined {
  if (panel && change.file === panel.file) return change.exists ? { kind: "reload" } : { kind: "deleted" };
  if (!change.exists || !change.created || change.newest !== change.file) return undefined;
  if (panel && panel.root === change.root) return { kind: "switch", root: change.root, file: change.file };
  return { kind: "notify", root: change.root, file: change.file };
}
