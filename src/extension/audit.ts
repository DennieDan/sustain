// ACC-05: `Sustain: Audit Map` and the map's title-bar button. Runs the audit skill on the shown map,
// which checks each box against its cited code and records audit.json beside it.
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { repoRootFor } from "../model/discovery";
import { parseDiagram } from "../model/tolerant";
import { confirmAndLaunch, type LaunchTask } from "./generate";
import { ArchitecturePanel } from "./panel";
import type { Runs } from "./runs";

/** The audit of `candidate`, named by its map's title. */
export function auditTask(candidate: string): LaunchTask {
  const run = basename(dirname(candidate));
  let title = run;
  try {
    const result = parseDiagram(readFileSync(candidate, "utf8"));
    if (result.ok && result.diagram.title) title = result.diagram.title;
  } catch {
    // An unreadable map is named by its folder.
  }
  return { skill: "sustain-audit", args: run, title: `Audit of ${title}` };
}

/** Audits `file`, or the map the panel shows. Without either there is nothing to audit. */
export async function auditMapCommand(context: vscode.ExtensionContext, runs: Runs, file?: string): Promise<void> {
  const panel = ArchitecturePanel.current;
  const candidate = file ?? (panel !== undefined && panel.file !== "" ? panel.file : undefined);
  if (candidate === undefined) {
    void vscode.window.showInformationMessage("Open a map to audit it.");
    return;
  }
  const fallback = panel?.root ?? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(candidate))?.uri.fsPath ?? dirname(candidate);
  await confirmAndLaunch(context, runs, repoRootFor(candidate, fallback), auditTask(candidate));
}
