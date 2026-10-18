// UI-03 and UI-05: Show in Map from the editor title or the Explorer, Map this folder from the
// Explorer or an empty map, and Open code from a box's context menu.
import { relative, sep } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { confirmAndLaunch } from "./generate";
import { ArchitecturePanel } from "./panel";
import type { Runs } from "./runs";

/**
 * Opens or reveals the map beside the editor, keeping the editor active, and marks the boxes
 * citing `uri` (the active editor's file when absent). The map shown for that folder stays;
 * otherwise its newest candidate opens. A folder without one gets the offer to map it.
 */
export async function showInMapCommand(extensionUri: vscode.Uri, uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  const folder = target?.scheme === "file" ? vscode.workspace.getWorkspaceFolder(target) : undefined;
  if (!target || !folder) {
    void vscode.window.showErrorMessage("Show in Map works on a file inside an open folder.");
    return;
  }
  const root = folder.uri.fsPath;
  const current = ArchitecturePanel.current;
  const keep = current !== undefined && current.root === root && current.file !== "";
  const newest = listCandidates(root)[0]?.file;
  let panel: ArchitecturePanel;
  if (keep) panel = ArchitecturePanel.show(extensionUri, root, current.file, true);
  else if (newest !== undefined) panel = ArchitecturePanel.show(extensionUri, root, newest, true);
  else panel = ArchitecturePanel.showNoMap(extensionUri, root, true);
  panel.highlight(target.fsPath);
}

/** Generate focused on `uri`, a folder: its path inside the workspace folder, or no focus for the folder itself. */
export async function mapFolderCommand(context: vscode.ExtensionContext, runs: Runs, uri?: vscode.Uri): Promise<void> {
  const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : vscode.workspace.workspaceFolders?.[0];
  if (!uri || !folder) {
    void vscode.window.showErrorMessage("Map this folder works on a folder inside an open workspace folder.");
    return;
  }
  const root = folder.uri.fsPath;
  const focus = relative(root, uri.fsPath).split(sep).join("/");
  await confirmAndLaunch(context, runs, root, focus);
}

/** The argument a `webview/context` menu passes: the box's `data-vscode-context` and the view type. */
interface BoxContext {
  componentId?: unknown;
}

export async function openBoxCodeCommand(context?: BoxContext): Promise<void> {
  if (typeof context?.componentId === "string") await ArchitecturePanel.current?.openBox(context.componentId);
}
