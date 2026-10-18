// FRS-07: `Sustain: Compare With…` in the map's title bar. Picks another map of the folder and draws
// what changed since it on the shown map.
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import * as vscode from "vscode";
import { diffMaps } from "../model/diff";
import { listCandidates } from "../model/discovery";
import { parseDiagram, type ViewDiagram } from "../model/tolerant";
import { ArchitecturePanel } from "./panel";

/** The map in `file`, or `null`. */
export function readMap(file: string): ViewDiagram | null {
  try {
    const result = parseDiagram(readFileSync(file, "utf8"));
    return result.ok ? result.diagram : null;
  } catch {
    return null;
  }
}

/** Compares the shown map with `other`, the candidate file of another run. Returns whether it could. */
export function compareWith(other: string): boolean {
  const panel = ArchitecturePanel.current;
  const shown = panel === undefined || panel.file === "" ? null : readMap(panel.file);
  const older = readMap(other);
  if (panel === undefined || shown === null || older === null) return false;
  panel.showCompare({ against: basename(dirname(other)), diff: diffMaps(older, shown) });
  return true;
}

export async function compareMapsCommand(): Promise<void> {
  const panel = ArchitecturePanel.current;
  if (panel === undefined || panel.file === "") return;
  const others = listCandidates(panel.root).filter((candidate) => candidate.file !== panel.file);
  if (others.length === 0) {
    void vscode.window.showInformationMessage("This folder has no other map to compare with.");
    return;
  }
  const picked = await vscode.window.showQuickPick(
    others.map((candidate) => ({ label: candidate.runFolder, file: candidate.file })),
    { placeHolder: "Compare the shown map with which map?" },
  );
  if (picked !== undefined && !compareWith(picked.file)) void vscode.window.showErrorMessage(`Cannot read ${picked.label} to compare with it.`);
}
