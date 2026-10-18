// Watches `<folder>/.archify/` in every workspace folder and acts on run folders' candidates
// (FR-WAT-01, ADR 0026). Any event in a run folder rechecks its candidate.json, because file
// watchers can miss a file created inside a folder created a moment before. A listing every
// 2 s catches candidates whose events never arrived, which happens on WSL under load.
import { existsSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { ArchitecturePanel } from "./panel";
import { candidateOf, ChangeBatch, DELETED_MESSAGE, noteCandidate, watchAction } from "./watchLogic";

/** How often each folder's candidates are listed in case an event was missed. */
export const LIST_INTERVAL_MS = 2_000;

export class CandidateWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  /** Candidates seen so far, per workspace folder root. */
  private readonly known = new Map<string, Set<string>>();
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly batch = new ChangeBatch((changes) => {
    for (const file of changes.keys()) {
      const root = dirname(dirname(dirname(file)));
      const known = this.known.get(root) ?? new Set<string>();
      this.known.set(root, known);
      void this.apply(file, noteCandidate(known, file, existsSync(file)));
    }
    this.changed.fire();
  });
  private readonly folderListener: vscode.Disposable;
  private readonly poll: NodeJS.Timeout;

  /** Fires after candidates were added, changed or removed, for the sidebar's maps list. */
  readonly onDidChange = this.changed.event;

  /**
   * @param quiet Whether new candidates in a folder go unannounced, because the sidebar run that
   * makes them opens the map itself (UI-02).
   */
  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly quiet: (root: string) => boolean = () => false,
  ) {
    this.watch(vscode.workspace.workspaceFolders ?? []);
    this.folderListener = vscode.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
      for (const folder of removed) {
        this.watchers.get(folder.uri.toString())?.dispose();
        this.watchers.delete(folder.uri.toString());
      }
      this.watch(added);
    });
    this.poll = setInterval(() => this.listAll(), LIST_INTERVAL_MS);
  }

  /** Feeds candidates that appeared or vanished without an event into the usual batch. */
  private listAll(): void {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const root = folder.uri.fsPath;
      const known = this.known.get(root);
      if (known === undefined) continue;
      const now = new Set(listCandidates(root).map((candidate) => candidate.file));
      for (const file of now) if (!known.has(file)) this.batch.add(file, false);
      for (const file of known) if (!now.has(file)) this.batch.add(file, false);
    }
  }

  private watch(folders: readonly vscode.WorkspaceFolder[]): void {
    for (const folder of folders) {
      const root = folder.uri.fsPath;
      this.known.set(root, new Set(listCandidates(root).map((candidate) => candidate.file)));
      const archify = join(root, ".archify");
      const onEvent = (uri: vscode.Uri): void => {
        const candidate = candidateOf(archify, uri.fsPath, sep);
        if (candidate !== undefined) this.batch.add(candidate, false);
      };
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, ".archify/**"));
      watcher.onDidCreate(onEvent);
      watcher.onDidChange(onEvent);
      watcher.onDidDelete(onEvent);
      this.watchers.set(folder.uri.toString(), watcher);
    }
  }

  private async apply(file: string, created: boolean): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
    if (!folder) return;
    const root = folder.uri.fsPath;
    const panel = ArchitecturePanel.current;
    const action = watchAction(
      { file, created, exists: existsSync(file), root, newest: listCandidates(root)[0]?.file },
      panel && { root: panel.root, file: panel.file },
    );
    switch (action?.kind) {
      case "reload":
        panel?.reload();
        return;
      case "deleted":
        panel?.showEmpty(DELETED_MESSAGE);
        return;
      case "switch":
        panel?.showFile(action.root, action.file);
        return;
      case "notify": {
        if (this.quiet(action.root)) return;
        const choice = await vscode.window.showInformationMessage(`New architecture diagram: \`${basename(dirname(action.file))}\``, "Open");
        if (choice === "Open") ArchitecturePanel.show(this.extensionUri, action.root, action.file);
        return;
      }
      case undefined:
        return;
    }
  }

  dispose(): void {
    clearInterval(this.poll);
    this.batch.dispose();
    this.changed.dispose();
    this.folderListener.dispose();
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
  }
}
