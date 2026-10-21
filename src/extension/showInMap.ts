// UI-03 and UI-05: Show in Map from the editor title or the Explorer, Map this folder from the
// Explorer or an empty map, and Open code from a box's context menu.
import { relative, sep } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { confirmAndLaunch, generateTask } from "./generate";
import { onAction, openFolder } from "./notify";
import type { Runs } from "./runs";
import { showViewer } from "./viewer";

/**
 * Opens or reveals the folder's newest map beside the editor, keeping the editor active.
 * A folder without one gets the offer to map it.
 */
export async function showInMapCommand(uri?: vscode.Uri): Promise<void> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  const folder = target?.scheme === "file" ? vscode.workspace.getWorkspaceFolder(target) : undefined;
  if (!target || !folder) {
    onAction(vscode.window.showErrorMessage("Show in Map works on a file inside an open folder.", "Open Folder…"), "Open Folder…", openFolder);
    return;
  }
  const newest = listCandidates(folder.uri.fsPath)[0]?.file;
  if (newest === undefined) {
    const action = await vscode.window.showInformationMessage("No architecture diagram yet.", "Generate");
    if (action === "Generate") await vscode.commands.executeCommand("sustain.generateArchitecture");
    return;
  }
  await showViewer(newest, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
}

/** Generate focused on `uri`, a folder: its path inside the workspace folder, or no focus for the folder itself. */
export async function mapFolderCommand(context: vscode.ExtensionContext, runs: Runs, uri?: vscode.Uri): Promise<void> {
  const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : vscode.workspace.workspaceFolders?.[0];
  if (!uri || !folder) {
    onAction(vscode.window.showErrorMessage("Map this folder works on a folder inside an open workspace folder.", "Open Folder…"), "Open Folder…", openFolder);
    return;
  }
  const root = folder.uri.fsPath;
  const focus = relative(root, uri.fsPath).split(sep).join("/");
  await confirmAndLaunch(context, runs, root, generateTask(focus));
}

/** The argument a `webview/context` menu passes: the box's `data-vscode-context` and the view type. */
interface BoxContext {
  componentId?: unknown;
}

export async function openBoxCodeCommand(context?: BoxContext): Promise<void> {
  if (typeof context?.componentId !== "string") return;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const file = root === undefined ? undefined : listCandidates(root)[0]?.file;
  if (root === undefined || file === undefined) return;
  const { readFileSync } = await import("node:fs");
  const { readDiagram } = await import("../core/tolerant");
  const { openSource } = await import("./navigate");
  const result = readDiagram(JSON.parse(readFileSync(file, "utf8")));
  if (!result.ok) return;
  const component = result.diagram.components.find((entry) => entry.id === context.componentId);
  if (component !== undefined) await openSource(root, component, 0, undefined);
}
