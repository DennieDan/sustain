// Watches `<folder>/.archify/` in every workspace folder and acts on run folders' candidates
// (FR-WAT-01, ADR 0026). Any event in a run folder rechecks its candidate.json, because file
// watchers can miss a file created inside a folder created a moment before.
import { existsSync } from "node:fs";
import { basename, dirname, join, sep } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { ArchitecturePanel } from "./panel";
import { candidateOf, ChangeBatch, DELETED_MESSAGE, noteCandidate, watchAction } from "./watchLogic";

export class CandidateWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  /** Candidates seen so far, per workspace folder root. */
  private readonly known = new Map<string, Set<string>>();
  private readonly batch = new ChangeBatch((changes) => {
    for (const file of changes.keys()) {
      const root = dirname(dirname(dirname(file)));
      const known = this.known.get(root) ?? new Set<string>();
      this.known.set(root, known);
      void this.apply(file, noteCandidate(known, file, existsSync(file)));
    }
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
