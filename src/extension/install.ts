// `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006): copies both skills into
// `.agents/skills/`. Hooks and git excludes belong to the session launch (spec v0.3 SAF-06).
import * as vscode from "vscode";
import { pickRepoRoot } from "./folders";
import { ensureGitExclude, mergeHooks } from "./hooksFiles";
import { SKILL_NAMES, skillInstalled, skillTargets, writeSkill } from "./skillFiles";

/**
 * The session-side assets, merged when a learning session launches: the managed hooks block
 * and Sustain's git excludes. A corrupt hooks file throws, and the caller reports it rather
 * than overwriting.
 */
export function ensureSessionAssets(root: string): void {
  mergeHooks(root);
  ensureGitExclude(root);
}

/**
 * Installs the built skills into `root`, asking before replacing an existing install.
 * Cancel changes nothing.
 */
export async function installSkill(extensionUri: vscode.Uri, root: string): Promise<"installed" | "cancelled"> {
  const installed = SKILL_NAMES.filter((name) => skillInstalled(skillTargets(root, name)));
  if (installed.length > 0) {
    const choice = await vscode.window.showWarningMessage(`Overwrite the existing ${installed.join(" and ")} skill${installed.length > 1 ? "s" : ""}?`, { modal: true }, "Overwrite");
    if (choice !== "Overwrite") return "cancelled";
  }
  const kinds = new Set<"symlink" | "copy">();
  for (const name of SKILL_NAMES) {
    const source = vscode.Uri.joinPath(extensionUri, "dist", "skills", name).fsPath;
    kinds.add(writeSkill(root, source, skillTargets(root, name), name));
  }
  void vscode.window.showInformationMessage(`Installed the Sustain skills in .agents/skills/ (${[...kinds].join("/")} for .claude).`);
  return "installed";
}

export async function installSkillsCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (folder) await installSkill(extensionUri, folder.uri.fsPath);
}
