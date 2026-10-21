// SAF-08: `Sustain: Remove Sustain from This Folder`, in the palette and the sidebar's title bar.
// What Sustain added to the folder goes once confirmed: skills installed in the repository, hook
// entries, its lines in .git/info/exclude, and its block in AGENTS.md and CLAUDE.md. Maps, sessions
// and the config go only after a second question, and the per-user skills are offered last.
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { removeNotes, NOTES_START } from "./notesBlock";
import { CONFIG_FILE } from "../core-node/config";
import { assertWritable, isWithin } from "../core-node/confine";
import { ARCHIFY_DIR } from "../core-node/runFolder";
import { SUSTAIN_DIR } from "../model/session";
import { pickRepoRoot } from "./folders";
import { removeAgentHooks, removeGitExclude, removeHooks } from "../extension/hooksFiles";
import { SKILL_NAMES, skillInstalled, skillTargets } from "../core-node/skillFiles";

/** The files whose Sustain block goes (ARC-04). */
const NOTES_FILES = ["AGENTS.md", "CLAUDE.md"];

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Throws unless the folder holding `path` resolves inside `root`. Removing a link never follows it. */
function assertRemovable(root: string, path: string): void {
  if (!isWithin(realpathSync(root), realpathSync(dirname(path)))) throw new Error(`${path} lies outside ${root}`);
}

/** Removes the Sustain skills installed under `base`, the repository or the home folder; returns whether any went. */
export function removeSkills(base: string, root: string): boolean {
  let removed = false;
  for (const name of SKILL_NAMES) {
    const { agentsDir, claudeLink } = skillTargets(base, name);
    for (const path of [claudeLink, agentsDir]) {
      if (!exists(path)) continue;
      assertRemovable(root, path);
      // A link is removed itself, never followed.
      rmSync(path, { recursive: true, force: true });
      removed = true;
    }
  }
  return removed;
}

/** Removes what Sustain added to `root` without asking about data; returns what went, for the message. */
export function removeSustainAdditions(root: string): string[] {
  const removed: string[] = [];
  if (removeSkills(root, root)) removed.push("the skills in .agents/skills and .claude/skills");
  const hooks = [removeHooks(root), removeAgentHooks(root, "claude"), removeAgentHooks(root, "codex")];
  if (hooks.some((result) => result !== "none")) removed.push("Sustain's hook entries");
  if (removeGitExclude(root)) removed.push("its lines in .git/info/exclude");
  for (const name of NOTES_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    if (!text.includes(NOTES_START)) continue;
    assertWritable(root, path);
    const rest = removeNotes(text);
    if (rest.trim() === "") rmSync(path);
    else writeFileSync(path, rest);
    removed.push(`its block in ${name}`);
  }
  return removed;
}

/** Asks, removes Sustain from the folder, then asks about its data and the per-user skills. */
export async function removeSustainCommand(): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;
  const name = vscode.workspace.asRelativePath(folder.uri) || folder.name;
  const choice = await vscode.window.showWarningMessage(
    `Remove Sustain from ${folder.name}?`,
    { modal: true, detail: "The skills installed in this repository, Sustain's hook entries, its lines in .git/info/exclude and its block in AGENTS.md and CLAUDE.md go now. Maps, learning sessions and the config are asked about next." },
    "Remove",
  );
  if (choice !== "Remove") return;
  try {
    removeSustainAdditions(root);
  } catch (error) {
    void vscode.window.showErrorMessage(`Sustain could not remove everything from ${name}: ${(error as Error).message}`, "Remove Again");
    return;
  }
  const data = [ARCHIFY_DIR, SUSTAIN_DIR, CONFIG_FILE].filter((entry) => existsSync(join(root, entry)));
  if (data.length > 0) {
    const kept = await vscode.window.showWarningMessage(
      `Also delete ${data.join(", ")}?`,
      { modal: true, detail: "The maps, the learning sessions and the config go for good. Git keeps any you committed." },
      "Delete",
    );
    if (kept === "Delete") {
      for (const entry of data) {
        assertRemovable(root, join(root, entry));
        rmSync(join(root, entry), { recursive: true, force: true });
      }
    }
  }
  const home = homedir();
  if (SKILL_NAMES.some((skill) => skillInstalled(skillTargets(home, skill)))) {
    const everywhere = await vscode.window.showInformationMessage("Also remove the Sustain skills from your home folder? Other folders that use them lose them.", "Remove from Home");
    if (everywhere === "Remove from Home") removeSkills(home, home);
  }
  void vscode.window.showInformationMessage(`Removed Sustain from ${folder.name}.`);
}
