// `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006).
import * as vscode from "vscode";
import { pickRepoRoot } from "./folders";
import { AGENTS_SKILL_DIR, CLAUDE_SKILL_LINK, SKILL_NAME, skillInstalled, skillTargets, writeSkill } from "./skillFiles";

/**
 * Installs the built skill into `root`, asking before replacing an existing install.
 * Cancel changes nothing.
 */
export async function installSkill(extensionUri: vscode.Uri, root: string): Promise<"installed" | "cancelled"> {
  const targets = skillTargets(root);
  if (skillInstalled(targets)) {
    const choice = await vscode.window.showWarningMessage("Overwrite the existing sustain-architecture skill?", { modal: true }, "Overwrite");
    if (choice !== "Overwrite") return "cancelled";
  }
  const source = vscode.Uri.joinPath(extensionUri, "dist", "skills", SKILL_NAME).fsPath;
  const claudeKind = writeSkill(source, targets);
  void vscode.window.showInformationMessage(`Installed the sustain-architecture skill in ${AGENTS_SKILL_DIR} and ${CLAUDE_SKILL_LINK} (${claudeKind}).`);
  return "installed";
}

export async function installSkillsCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (folder) await installSkill(extensionUri, folder.uri.fsPath);
}
