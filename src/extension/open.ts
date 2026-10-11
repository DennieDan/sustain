// `Sustain: Open Architecture` and `Sustain: Open Architecture File…` (FR-VIEW-01, FR-VIEW-02).
import { readFileSync } from "node:fs";
import * as vscode from "vscode";
import { listCandidates, repoRootFor } from "../model/discovery";
import { parseDiagram } from "../model/tolerant";
import { pickRepoRoot } from "./folders";
import { ArchitecturePanel } from "./panel";

export async function openArchitectureCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;
  const newest = listCandidates(root)[0];
  if (newest) {
    ArchitecturePanel.show(extensionUri, root, newest.file);
    return;
  }
  const action = await vscode.window.showInformationMessage("No architecture diagram yet.", "Generate");
  if (action === "Generate") await vscode.commands.executeCommand("sustain.generateArchitecture");
}

/** `meta.title` of a candidate for the QuickPick, if it can be read. */
function titleOf(file: string): string | undefined {
  try {
    const result = parseDiagram(readFileSync(file, "utf8"));
    return result.ok ? result.diagram.title : undefined;
  } catch {
    return undefined;
  }
}

export async function openArchitectureFileCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;
  const items: (vscode.QuickPickItem & { file?: string })[] = listCandidates(root).map((candidate) => {
    const title = titleOf(candidate.file);
    return title === undefined ? { label: candidate.runFolder, file: candidate.file } : { label: candidate.runFolder, description: title, file: candidate.file };
  });
  items.push({ label: "Browse…" });
  const picked = await vscode.window.showQuickPick(items, { placeHolder: "Architecture diagram" });
  if (!picked) return;
  let file = picked.file;
  if (file === undefined) {
    const chosen = await vscode.window.showOpenDialog({ canSelectMany: false, defaultUri: folder.uri, filters: { JSON: ["json"] } });
    if (!chosen?.[0]) return;
    file = chosen[0].fsPath;
  }
  ArchitecturePanel.show(extensionUri, repoRootFor(file, root), file);
}
