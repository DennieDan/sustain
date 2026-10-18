// `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006): copies both skills into
// `.agents/skills/` of the user's home or the repository (`sustain.skillScope`, spec v0.3
// SET-01). Hooks and git excludes belong to the session launch (SAF-06).
import * as vscode from "vscode";
import { pickRepoRoot } from "./folders";
import { ensureGitExclude, mergeHooks, sessionHookCommand } from "./hooksFiles";
import { configuredScope } from "./scope";
import { SKILL_NAMES, skillBase, skillInstalled, skillTargets, writeSkill } from "./skillFiles";

/**
 * The session-side assets, merged when a learning session launches: the managed hooks block
 * and Sustain's git excludes. A corrupt hooks file throws, and the caller reports it rather
 * than overwriting.
 */
export function ensureSessionAssets(root: string): void {
  const base = skillBase(configuredScope(), root);
  mergeHooks(root, sessionHookCommand(base === root ? undefined : base));
  ensureGitExclude(root);
}

/** How messages name the install folder: `~/.agents/skills/` for a per-user install. */
export function installLabel(base: string, root: string): string {
  return base === root ? ".agents/skills/" : "~/.agents/skills/";
}

/**
 * Installs the built skills for `root` per `sustain.skillScope`, asking before replacing an
 * existing install. Cancel changes nothing.
 */
export async function installSkill(extensionUri: vscode.Uri, root: string): Promise<"installed" | "cancelled"> {
  const base = skillBase(configuredScope(), root);
  const installed = SKILL_NAMES.filter((name) => skillInstalled(skillTargets(base, name)));
  if (installed.length > 0) {
    const choice = await vscode.window.showWarningMessage(`Overwrite the existing ${installed.join(" and ")} skill${installed.length > 1 ? "s" : ""}?`, { modal: true }, "Overwrite");
    if (choice !== "Overwrite") return "cancelled";
  }
  const kinds = new Set<"symlink" | "copy">();
  for (const name of SKILL_NAMES) {
    const source = vscode.Uri.joinPath(extensionUri, "dist", "skills", name).fsPath;
    kinds.add(writeSkill(base, source, skillTargets(base, name), name));
  }
  void vscode.window.showInformationMessage(`Installed the Sustain skills in ${installLabel(base, root)} (${[...kinds].join("/")} for .claude).`);
  return "installed";
}

export async function installSkillsCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (folder) await installSkill(extensionUri, folder.uri.fsPath);
}
