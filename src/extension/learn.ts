// `Sustain: Start Learning Session` (ADRs 0029–0036): folder + mode + task + agent, ensures the
// skill and that agent's hooks are in place, then launches Claude Code, Codex or Devin with
// `/sustain-bugfix <task>` (`$sustain-bugfix` in Codex) in a terminal — the same
// shellPath/shellArgs shape as `generateArchitectureCommand` (ADR 0020, spec v0.3 LRN-01).
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { pickRepoRoot } from "./folders";
import { ensureSessionAssets, installSkill } from "./install";
import { ensureSkillIntact } from "./integrity";
import { SessionPanel } from "./sessionPanel";
import { configuredScope } from "./scope";
import { sessionAgents, sessionArgs, sessionPrompt } from "./sessionAgents";
import { agentsSkillDir, skillBase } from "../core-node/skillFiles";

interface LearningMode {
  label: string;
  detail: string;
}

const MODES: readonly LearningMode[] = [
  { label: "Bug hunt", detail: "The agent implements your task in steps and plants one hidden bug per step — find and fix them" },
];

export async function startLearningSessionCommand(extensionUri: vscode.Uri): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const root = folder.uri.fsPath;

  if (!existsSync(join(skillBase(configuredScope(), root), ...agentsSkillDir("sustain-bugfix").split("/"), "SKILL.md"))) {
    const choice = await vscode.window.showInformationMessage("Install the Sustain skills first?", "Install", "Cancel");
    if (choice !== "Install") return;
    if ((await installSkill(extensionUri, root)) === "cancelled") return;
  }

  const mode = await vscode.window.showQuickPick(MODES.map((entry) => ({ label: entry.label, detail: entry.detail, mode: entry })), {
    placeHolder: "Learning mode",
  });
  if (!mode) return;

  const task = await vscode.window.showInputBox({
    prompt: "What should the agent implement? This becomes the session's task.",
    validateInput: (value) => (value.trim() === "" ? "A task is required — the agent implements it step by step" : undefined),
  });
  if (task === undefined) return;

  // LRN-01: the session runs in Claude Code, Codex or Devin.
  const found = sessionAgents(process.env);
  if (found.length === 0) {
    const action = await vscode.window.showWarningMessage("No Claude Code, Codex or Devin was found on PATH or where Devin installs.", "Copy prompt");
    if (action === "Copy prompt") await vscode.env.clipboard.writeText(sessionPrompt("claude", task));
    return;
  }
  const launcher =
    found.length === 1 ? found[0]! : (await vscode.window.showQuickPick(found.map((entry) => ({ label: entry.label, launcher: entry })), { placeHolder: "Which agent runs the session?" }))?.launcher;
  if (launcher === undefined) return;
  if (!(await ensureSkillIntact(extensionUri, root, launcher.agent, "sustain-bugfix"))) return;

  try {
    ensureSessionAssets(root, launcher.agent);
  } catch (error) {
    const choice = await vscode.window.showWarningMessage(
      `The ${launcher.label} hooks could not be merged — hunt edits won't be blocked: ${(error as Error).message}`,
      { modal: true },
      "Start Anyway",
    );
    if (choice !== "Start Anyway") return;
  }

  const terminal = vscode.window.createTerminal({ name: `Sustain: ${mode.mode.label}`, cwd: root, shellPath: launcher.binary, shellArgs: sessionArgs(launcher.agent, task) });
  terminal.show();
  SessionPanel.show(extensionUri, root);
  if (launcher.agent === "codex") void vscode.window.showInformationMessage("Codex runs Sustain's hook only once you trust it. Type /hooks in Codex to review and trust it.");
}
