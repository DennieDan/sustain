// Watches `<folder>/.sustain/{active,*/session.json}` in every workspace folder and reloads
// the session panel (ADR 0034). Reuses the ChangeBatch debounce of the diagram watcher;
// no notifications — a learning session writes session.json every turn. When the lock goes,
// the session's hook entries go with it (spec v0.3 SAF-06).
import { basename } from "node:path";
import * as vscode from "vscode";
import { removeHooksWhenIdle } from "./hooksFiles";
import { onAction } from "./notify";
import { SessionPanel } from "./sessionPanel";
import { ChangeBatch } from "./watchLogic";

export class SessionWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher[]>();
  private readonly batch = new ChangeBatch((changes) => this.flush(changes));
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly folderListener: vscode.Disposable;

  /** Fires after a session changed, for the sidebar's session section. */
  readonly onDidChange = this.changed.event;

  constructor() {
    this.watch(vscode.workspace.workspaceFolders ?? []);
    this.folderListener = vscode.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
      for (const folder of removed) {
        for (const watcher of this.watchers.get(folder.uri.toString()) ?? []) watcher.dispose();
        this.watchers.delete(folder.uri.toString());
      }
      this.watch(added);
    });
  }

  private watch(folders: readonly vscode.WorkspaceFolder[]): void {
    for (const folder of folders) {
      const watchers = [".sustain/active", ".sustain/*/session.json"].map((pattern) => {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
        watcher.onDidCreate((uri) => this.batch.add(uri.fsPath, true));
        watcher.onDidChange((uri) => this.batch.add(uri.fsPath, false));
        watcher.onDidDelete((uri) => this.batch.add(uri.fsPath, false));
        return watcher;
      });
      this.watchers.set(folder.uri.toString(), watchers);
    }
  }

  private flush(changes: ReadonlyMap<string, boolean>): void {
    for (const file of changes.keys()) {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
      if (basename(file) !== "active" || folder === undefined) continue;
      try {
        removeHooksWhenIdle(folder.uri.fsPath);
      } catch (error) {
        const root = folder.uri.fsPath;
        onAction(vscode.window.showWarningMessage(`The learning session ended, but its Devin hooks could not be removed: ${(error as Error).message}`, "Try Again"), "Try Again", () => removeHooksWhenIdle(root));
      }
    }
    this.changed.fire();
    const panel = SessionPanel.current;
    if (panel === undefined) return;
    for (const file of changes.keys()) {
      const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file));
      if (folder !== undefined && folder.uri.fsPath === panel.root) {
        panel.reload();
        return;
      }
    }
  }

  dispose(): void {
    this.batch.dispose();
    this.changed.dispose();
    this.folderListener.dispose();
    for (const watchers of this.watchers.values()) for (const watcher of watchers) watcher.dispose();
    this.watchers.clear();
  }
}
