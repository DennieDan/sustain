// RCH-01: Export Page from the map's title bar and the maps list. It writes the same one-file page
// render-html.mjs writes, beside the candidate, and offers to open it in the browser.
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import { assertWritable } from "../model/confine";
import { repoRootFor } from "../model/discovery";
import { pageOutput, renderPage } from "../model/page";
import { readDiagram } from "../model/tolerant";
import { isJsonObject, type Repository } from "../model/types";
import { ArchitecturePanel } from "./panel";

/** Writes the page for `candidate` and returns its path. */
export function exportPage(extensionUri: vscode.Uri, root: string, candidate: string): string {
  const dist = join(extensionUri.fsPath, "dist");
  const assets = { script: readFileSync(join(dist, "page.js"), "utf8"), style: readFileSync(join(dist, "page.css"), "utf8") };
  const doc: unknown = JSON.parse(readFileSync(candidate, "utf8"));
  const run = basename(dirname(candidate));
  const read = readDiagram(doc);
  const meta = isJsonObject(doc) && isJsonObject(doc["meta"]) ? doc["meta"] : {};
  const repository = isJsonObject(meta["repository"]) ? (meta["repository"] as unknown as Repository) : null;
  const out = join(dirname(candidate), pageOutput(run, doc));
  assertWritable(root, out);
  writeFileSync(out, renderPage({ title: (read.ok ? read.diagram.title : undefined) ?? run, doc, root, project: basename(root), repository }, assets));
  return out;
}

/** Exports `file`, or the map the panel shows. */
export async function exportPageCommand(extensionUri: vscode.Uri, file?: string): Promise<void> {
  const panel = ArchitecturePanel.current;
  const candidate = file ?? (panel !== undefined && panel.file !== "" ? panel.file : undefined);
  if (candidate === undefined) {
    void vscode.window.showInformationMessage("Open a map first. Export Page writes the shown map as a web page.");
    return;
  }
  const root = repoRootFor(candidate, panel?.root ?? dirname(candidate));
  let out: string;
  try {
    out = exportPage(extensionUri, root, candidate);
  } catch (error) {
    void vscode.window.showErrorMessage(`Could not write the diagram page: ${(error as Error).message}`);
    return;
  }
  const choice = await vscode.window.showInformationMessage(`Wrote the diagram page: ${vscode.workspace.asRelativePath(out)}`, "Open in Browser");
  if (choice === "Open in Browser") await vscode.env.openExternal(vscode.Uri.file(out));
}
