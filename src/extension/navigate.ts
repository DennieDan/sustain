// Opening the code behind a diagram node (FR-NAV-01..03, ADR 0011) and a changed file from the
// Changes panel (FR-CMP-07).
import * as vscode from "vscode";
import type { ViewComponent } from "../model/tolerant";
import type { SourceRef } from "../model/types";
import { onAction } from "./notify";
import { resolveSource } from "./sourceTarget";

/** How long the opened lines stay highlighted. */
const HIGHLIGHT_MS = 2_000;
/** How long the "no source references" status bar message stays. */
const STATUS_MS = 3_000;

/**
 * Opens `component.sources[index]` from `root` in the editor column that is not the viewer's
 * (`viewerColumn === 1 ? 2 : 1`), selecting and briefly highlighting the cited lines.
 */
export async function openSource(root: string, component: ViewComponent, index: number, viewerColumn: vscode.ViewColumn | undefined): Promise<void> {
  if (component.sources.length === 0) {
    vscode.window.setStatusBarMessage(`\`${component.label}\` has no source references`, STATUS_MS);
    return;
  }
  const source = component.sources[index];
  if (source) await openSourceRef(root, source, viewerColumn);
}

/** A citation that no longer fits the code offers to update the map (SET-04). */
function refreshMap(): Thenable<unknown> {
  return vscode.commands.executeCommand("sustain.generateArchitecture");
}

/**
 * Opens `source` from `root` with the FR-NAV-02/03 rules, in the editor column that is not the
 * viewer's; a source without lines opens at the top without a selection.
 */
export async function openSourceRef(root: string, source: SourceRef, viewerColumn: vscode.ViewColumn | undefined): Promise<void> {
  const target = resolveSource(root, source);
  if (target.kind === "error") {
    if (target.problem === "invalid") onAction(vscode.window.showErrorMessage(`Invalid source path: \`${target.path}\``, "Refresh Map"), "Refresh Map", refreshMap);
    else onAction(vscode.window.showErrorMessage(`Stale reference: \`${target.path}\` no longer exists`, "Refresh Map"), "Refresh Map", refreshMap);
    return;
  }
  const viewColumn = viewerColumn === vscode.ViewColumn.One ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target.file));
  const editor = await vscode.window.showTextDocument(document, { viewColumn, preserveFocus: false });
  if (target.stale) onAction(vscode.window.showErrorMessage(`Stale reference: \`${source.path}\` has ${target.stale.lineCount} lines; the diagram cites ${target.stale.cited}`, "Refresh Map"), "Refresh Map", refreshMap);
  if (!target.lines || document.lineCount === 0) {
    // VS Code restores a document's last selection; "no selection" means the top of the file.
    const top = new vscode.Position(0, 0);
    editor.selection = new vscode.Selection(top, top);
    editor.revealRange(new vscode.Range(top, top), vscode.TextEditorRevealType.AtTop);
    return;
  }

  const last = document.lineCount - 1;
  const start = Math.min(target.lines.start - 1, last);
  const end = Math.min(target.lines.end - 1, last);
  const range = new vscode.Range(start, 0, end, document.lineAt(end).range.end.character);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  const highlight = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.rangeHighlightBackground"),
  });
  editor.setDecorations(highlight, [range]);
  setTimeout(() => highlight.dispose(), HIGHLIGHT_MS);
}
