// SKL-02: Tour in the map's title bar plays the shown map's tour.json, and Create Tour, in the maps
// list, the title bar and the palette, runs the tour skill on a map to write one.
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { repoRootFor } from "../model/discovery";
import { parseDiagram } from "../model/tolerant";
import { confirmAndLaunch, type LaunchTask } from "./generate";
import { ArchitecturePanel } from "./panel";
import type { Runs } from "./runs";

/** The tour skill's run on `candidate`, named by its map's title. */
export function tourTask(candidate: string): LaunchTask {
  const run = basename(dirname(candidate));
  let title = run;
  try {
    const result = parseDiagram(readFileSync(candidate, "utf8"));
    if (result.ok && result.diagram.title) title = result.diagram.title;
  } catch {
    // An unreadable map is named by its folder.
  }
  return { skill: "sustain-tour", args: run, title: `Tour of ${title}` };
}

/** Runs the tour skill on `file`, or on the map the panel shows. */
export async function createTourCommand(context: vscode.ExtensionContext, runs: Runs, file?: string): Promise<void> {
  const panel = ArchitecturePanel.current;
  const candidate = file ?? (panel !== undefined && panel.file !== "" ? panel.file : undefined);
  if (candidate === undefined) {
    void vscode.window.showInformationMessage("Open a map to create a tour of it.");
    return;
  }
  const fallback = panel?.root ?? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(candidate))?.uri.fsPath ?? dirname(candidate);
  await confirmAndLaunch(context, runs, repoRootFor(candidate, fallback), tourTask(candidate));
}

/** Plays the shown map's tour, or offers to create one when it has none. */
export async function playTourCommand(context: vscode.ExtensionContext, runs: Runs): Promise<void> {
  const panel = ArchitecturePanel.current;
  if (panel === undefined || panel.file === "") {
    void vscode.window.showInformationMessage("Open a map to play its tour.");
    return;
  }
  if (panel.tourStops !== null) {
    panel.playTour();
    return;
  }
  const choice = await vscode.window.showInformationMessage("This map has no tour yet.", "Create Tour");
  if (choice === "Create Tour") await createTourCommand(context, runs, panel.file);
}
