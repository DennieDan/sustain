import * as vscode from "vscode";
import { onAction, openFolder } from "./notify";

/**
 * The repo root a command works on (FR-WS-01): the only workspace folder, or the one the
 * user picks when there are several. `undefined` when no folder is open (after showing an
 * error) or the pick is dismissed.
 */
export async function pickRepoRoot(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    onAction(vscode.window.showErrorMessage("Open a folder first.", "Open Folder…"), "Open Folder…", openFolder);
    return undefined;
  }
  if (folders.length === 1) return folders[0];
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: "Workspace folder" },
  );
  return picked?.folder;
}
