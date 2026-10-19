// Watches `<folder>/.archify/*/candidate.sir` in every workspace folder (FR-WAT-01, FR-CMP-08,
// ADR 0027, ADR 0033).
import { existsSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../model/runFolder";
import { ArchitectureViewer, defaultColumn, showViewer } from "./viewer";
import { BASELINE_DELETED_MESSAGE, ChangeBatch, DELETED_MESSAGE, newRunAction, viewerAction } from "./watchLogic";

/** How long the baseline-deleted status bar message stays. */
const STATUS_MS = 3_000;

export class CandidateWatcher implements vscode.Disposable {
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly batch = new ChangeBatch((changes) => {
    for (const [file, created] of changes) void this.apply(file, created);
  });
  private readonly folderListener: vscode.Disposable;

  constructor() {
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
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, `${ARCHIFY_DIR}/*/${CANDIDATE_FILE}`));
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
    const change = { file, created, exists: existsSync(file), root, newest: listCandidates(root)[0]?.file };
    const viewers = ArchitectureViewer.all();
    let baselineDropped = false;
    for (const viewer of viewers) {
      switch (viewerAction(change, viewer.facts)) {
        case "reload":
          viewer.reload();
          break;
        case "deleted":
          viewer.showEmpty(DELETED_MESSAGE);
          break;
        case "baselineChanged":
          viewer.refreshCompare();
          break;
        case "baselineDeleted":
          viewer.clearBaseline();
          baselineDropped = true;
          break;
        case undefined:
          break;
      }
    }
    if (baselineDropped) vscode.window.setStatusBarMessage(BASELINE_DELETED_MESSAGE, STATUS_MS);

    const action = newRunAction(change, viewers.map((viewer) => viewer.facts));
    if (action?.kind === "open") {
      await showViewer(file, { viewColumn: viewers[action.viewer]!.panel.viewColumn ?? vscode.ViewColumn.Active, preserveFocus: true });
    } else if (action?.kind === "notify") {
      const choice = await vscode.window.showInformationMessage(`New architecture diagram: \`${basename(dirname(file))}\``, "Open");
      if (choice === "Open") await showViewer(file, { viewColumn: defaultColumn() });
    }
  }

  dispose(): void {
    this.batch.dispose();
    this.folderListener.dispose();
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
  }
}
