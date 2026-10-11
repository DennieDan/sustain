// Watches `<folder>/.archify/*/candidate.json` in every workspace folder (FR-WAT-01, ADR 0026).
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { ArchitecturePanel } from "./panel";
import { ChangeBatch, DELETED_MESSAGE, watchAction } from "./watchLogic";

export class CandidateWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly batch = new ChangeBatch((changes) => {
    for (const [file, created] of changes) void this.apply(file, created);
  });
  private readonly folderListener: vscode.Disposable;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.watch(vscode.workspace.workspaceFolders ?? []);
    this.folderListener = vscode.workspace.onDidChangeWorkspaceFolders(({ added, removed }) => {
      for (const folder of removed) {
        this.watchers.get(folder.uri.toString())?.dispose();
        this.watchers.delete(folder.uri.toString());
      }
      this.watch(added);
    });
  }

  private watch(folders: readonly vscode.WorkspaceFolder[]): void {
    for (const folder of folders) {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, ".archify/*/candidate.json"));
      watcher.onDidCreate((uri) => this.batch.add(uri.fsPath, true));
      watcher.onDidChange((uri) => this.batch.add(uri.fsPath, false));
      watcher.onDidDelete((uri) => this.batch.add(uri.fsPath, false));
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
        const choice = await vscode.window.showInformationMessage(`New architecture diagram: \`${basename(dirname(action.file))}\``, "Open");
        if (choice === "Open") ArchitecturePanel.show(this.extensionUri, action.root, action.file);
        return;
      }
      case undefined:
        return;
    }
  }

  dispose(): void {
    this.batch.dispose();
    this.folderListener.dispose();
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
  }
}
