// `Sustain: Open Architecture` (FR-VIEW-01, FR-VIEW-02): the newest diagram of the folder.
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { pickRepoRoot } from "./folders";
import { defaultColumn, showViewer } from "./viewer";

export async function openArchitectureCommand(): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const newest = listCandidates(folder.uri.fsPath)[0];
  if (newest) {
    await showViewer(newest.file, { viewColumn: defaultColumn() });
    return;
  }
  const action = await vscode.window.showInformationMessage("No architecture diagram yet.", "Generate");
  if (action === "Generate") await vscode.commands.executeCommand("sustain.generateArchitecture");
}
