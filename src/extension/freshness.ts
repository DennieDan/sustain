// FRS-03: how each shown map compares with the code, recomputed when a file it cites changes.
// Results are cached per candidate. Every workspace folder is watched from activation, and saves
// in the editor count too. A change to a cited file or to the fingerprints clears the affected
// entries and, after a 300 ms pause in events, tells listeners.
import { basename, dirname, relative, sep } from "node:path";
import * as vscode from "vscode";
import { FINGERPRINTS_FILE } from "../model/fingerprints";
import { renamesSince } from "../model/git";
import { fileReader, mapFreshness, readFingerprints, type MapFreshness } from "../model/staleness";
import { DEBOUNCE_MS } from "./watchLogic";

/** Boxes that need a look: edited or missing. */
export function changedBoxes(state: MapFreshness): number {
  return Object.values(state.boxes).filter((box) => box === "edited" || box === "missing").length;
}

interface Entry {
  root: string;
  state: MapFreshness;
  /** Repository-relative paths the map cites. */
  cited: Set<string>;
}

export class FreshnessService implements vscode.Disposable {
  private readonly cache = new Map<string, Entry>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private readonly changed = new vscode.EventEmitter<string>();
  private readonly listeners: vscode.Disposable[];

  /** Fires with a folder root after its maps' freshness may have changed. */
  readonly onDidChange = this.changed.event;

  constructor() {
    for (const folder of vscode.workspace.workspaceFolders ?? []) this.watch(folder.uri.fsPath);
    this.listeners = [
      vscode.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
        for (const folder of removed) {
          this.watchers.get(folder.uri.fsPath)?.dispose();
          this.watchers.delete(folder.uri.fsPath);
        }
        for (const folder of added) this.watch(folder.uri.fsPath);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (folder && document.uri.scheme === "file") this.note(folder.uri.fsPath, document.uri.fsPath);
      }),
    ];
  }

  /** The freshness of `candidate` in `root`, from the cache when nothing it cites changed. */
  of(root: string, candidate: string): MapFreshness {
    const cached = this.cache.get(candidate);
    if (cached) return cached.state;
    this.watch(root);
    const prints = readFingerprints(dirname(candidate));
    const renames = prints?.revision ? renamesSince(root, prints.revision) : new Map<string, string>();
    const state = mapFreshness(prints, fileReader(root), renames);
    this.cache.set(candidate, { root, state, cited: new Set(prints?.citations.map((print) => print.path) ?? []) });
    return state;
  }

  private watch(root: string): void {
    if (this.watchers.has(root)) return;
    const folder = vscode.workspace.workspaceFolders?.find((entry) => entry.uri.fsPath === root);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder ?? vscode.Uri.file(root), "**/*"));
    const onEvent = (uri: vscode.Uri): void => this.note(root, uri.fsPath);
    watcher.onDidChange(onEvent);
    watcher.onDidCreate(onEvent);
    watcher.onDidDelete(onEvent);
    this.watchers.set(root, watcher);
  }

  private note(root: string, file: string): void {
    const rel = relative(root, file).split(sep).join("/");
    const affected = [...this.cache.entries()].filter(
      ([candidate, entry]) => entry.root === root && (entry.cited.has(rel) || (basename(file) === FINGERPRINTS_FILE && dirname(file) === dirname(candidate))),
    );
    if (affected.length === 0) return;
    for (const [candidate] of affected) this.cache.delete(candidate);
    this.pending.add(root);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const roots = [...this.pending];
      this.pending.clear();
      for (const changedRoot of roots) this.changed.fire(changedRoot);
    }, DEBOUNCE_MS);
  }

  dispose(): void {
    clearTimeout(this.timer);
    for (const listener of this.listeners) listener.dispose();
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
    this.changed.dispose();
  }
}
