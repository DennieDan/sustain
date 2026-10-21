// RCH-04: "Copy prompt for…" GitHub Copilot agent mode, Cursor's agent, Gemini CLI, OpenCode and
// Devin Desktop, which Sustain does not launch. The prompt runs the architecture skill installed for
// the folder, so the skills are installed first when they are missing.
import { join } from "node:path";
import * as vscode from "vscode";
import { copiedPrompt, PROMPT_TARGETS } from "./agents";
import { pickRepoRoot } from "./folders";
import { installSkill } from "./install";
import { configuredScope } from "./scope";
import { skillBase, skillInstalled, skillTargets } from "../core-node/skillFiles";

/** Asks which agent, then copies the Generate prompt with `focus` for it. */
export async function copyPromptCommand(extensionUri: vscode.Uri, root: string, focus: string): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    PROMPT_TARGETS.map((target) => ({ label: target.label, target })),
    { placeHolder: "Copy the Generate prompt for which agent?" },
  );
  if (!picked) return;
  const base = skillBase(configuredScope(), root);
  if (!skillInstalled(skillTargets(base, "sustain-architecture")) && (await installSkill(extensionUri, root)) === "cancelled") return;
  const skillDir = join(base, ".agents", "skills", "sustain-architecture").split("\\").join("/");
  await vscode.env.clipboard.writeText(copiedPrompt(picked.target.id, "sustain-architecture", focus, skillDir));
  void vscode.window.showInformationMessage(`Copied the prompt for ${picked.target.label}. Paste it into its chat.`);
}

/** The palette command: the folder, the focus, then the agent. */
export async function copyPromptForCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const focus = await vscode.window.showInputBox({ prompt: "Focus (optional)" });
  if (focus === undefined) return;
  await copyPromptCommand(extensionUri, folder.uri.fsPath, focus);
}
