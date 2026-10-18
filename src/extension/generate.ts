// `Sustain: Generate Architecture` (FR-GEN-01): launches the chosen agent CLI in a terminal
// with the skill prompt as its argument (ADR 0020).
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { agentLaunchArgs, agentPrompt, AGENTS, findOnPath } from "./agents";
import { pickRepoRoot } from "./folders";
import { ensureGitExclude } from "./hooksFiles";
import { installSkill } from "./install";
import { ensureSkillIntact } from "./integrity";
import { agentsSkillDir } from "./skillFiles";

export async function generateArchitectureCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;

  if (!existsSync(join(root, ...agentsSkillDir("sustain-architecture").split("/"), "SKILL.md"))) {
    const choice = await vscode.window.showInformationMessage("Install the sustain-architecture skill first?", "Install", "Cancel");
    if (choice !== "Install") return;
    if ((await installSkill(extensionUri, root)) === "cancelled") return;
  }

  const focus = await vscode.window.showInputBox({ prompt: "Focus (optional)" });
  if (focus === undefined) return;
  const picked = await vscode.window.showQuickPick(
    AGENTS.map((agent) => ({ label: agent.label, agent })),
    { placeHolder: "Agent" },
  );
  if (!picked) return;
  const { agent } = picked;
  if (!(await ensureSkillIntact(extensionUri, root, agent.cli, "sustain-architecture"))) return;
  const prompt = agentPrompt(agent, focus);

  const shellPath = findOnPath(agent.cli, process.env);
  if (!shellPath) {
    const action = await vscode.window.showWarningMessage(`\`${agent.cli}\` was not found on PATH.`, "Copy prompt");
    if (action === "Copy prompt") await vscode.env.clipboard.writeText(prompt);
    return;
  }
  try {
    ensureGitExclude(root);
  } catch (error) {
    void vscode.window.showWarningMessage(`Draft and page files may show up in git status: ${(error as Error).message}`);
  }
  const terminal = vscode.window.createTerminal({ name: `Sustain: ${agent.label}`, cwd: root, shellPath, shellArgs: agentLaunchArgs(prompt) });
  terminal.show();
}
