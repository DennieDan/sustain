// Generate (FR-GEN-01, UI-02, SET-03): one click from the sidebar, which states beforehand what
// the click will also do, or the Command Palette, which asks for the focus and shows the same
// notes in one modal. The run streams into the sidebar or runs in a terminal (ADR 0020).
import { join } from "node:path";
import * as vscode from "vscode";
import { claudeParser } from "../model/agentStream/claude";
import { codexParser } from "../model/agentStream/codex";
import type { ComposerAgent, RunMode } from "../model/messages";
import { agentLaunchArgs, AGENTS, findOnPath, headlessArgs, SKILL_SCRIPTS, skillPrompt, type Agent, type SkillName } from "./agents";
import { pickRepoRoot } from "./folders";
import { ensureGitExclude } from "./hooksFiles";
import { ensureSkillIntact, skillNote, skillStatus } from "./integrity";
import { canRunHeadless } from "./runner";
import type { Runs } from "./runs";
import { configuredScope } from "./scope";
import { skillBase } from "./skillFiles";

const LAST_AGENT_KEY = "sustain.lastAgent";
const DATA_NOTE_KEY = "sustain.dataNoteShown";

export const DATA_NOTE = "Your agent reads this folder and sends what it reads to its own provider. Sustain sends nothing.";

/** `sustain.runMode`: stream into the sidebar (the default) or run in a terminal. */
export function configuredRunMode(): RunMode {
  return vscode.workspace.getConfiguration("sustain").get<RunMode>("runMode", "sidebar") === "terminal" ? "terminal" : "sidebar";
}

/** The agents found on absolute PATH entries (SAF-04). */
export function foundAgents(env: NodeJS.ProcessEnv = process.env): ComposerAgent[] {
  return AGENTS.flatMap((agent) => {
    const binary = findOnPath(agent.cli, env);
    return binary === undefined ? [] : [{ cli: agent.cli, label: agent.label, headless: canRunHeadless(binary) }];
  });
}

/** The remembered agent when it is still found, else the first one found. */
export function chosenAgent(context: vscode.ExtensionContext, agents: readonly ComposerAgent[]): "claude" | "codex" | null {
  const last = context.workspaceState.get<string>(LAST_AGENT_KEY);
  return agents.find((agent) => agent.cli === last)?.cli ?? agents[0]?.cli ?? null;
}

export function rememberAgent(context: vscode.ExtensionContext, cli: "claude" | "codex"): Thenable<void> {
  return context.workspaceState.update(LAST_AGENT_KEY, cli);
}

export interface LaunchNote {
  /** A repair means the skill on disk was changed (SAF-01), so the palette asks with a warning. */
  kind: "install" | "repair" | "data" | "terminal";
  text: string;
}

/** What a run of `skill` will launch: its arguments, and what the run card shows. */
export interface LaunchTask {
  skill: SkillName;
  args: string;
  title: string;
}

/** A Generate with `focus`. */
export function generateTask(focus: string): LaunchTask {
  return { skill: "sustain-architecture", args: focus.trim(), title: focus.trim() };
}

/** What a run of `skill` with `cli` will also do (SET-03): install or repair the skill, and the first-run data note. */
export function launchNotes(context: vscode.ExtensionContext, root: string, cli: "claude" | "codex", mode: RunMode, headless: boolean, skillName: SkillName = "sustain-architecture"): LaunchNote[] {
  const notes: LaunchNote[] = [];
  const status = skillStatus(context.extensionUri, root, cli, skillName);
  const skill = skillNote(status, skillName);
  if (skill !== null) notes.push({ kind: status.differing === null ? "install" : "repair", text: skill });
  if (context.globalState.get<boolean>(DATA_NOTE_KEY) !== true) notes.push({ kind: "data", text: DATA_NOTE });
  if (mode === "sidebar" && !headless) notes.push({ kind: "terminal", text: "Runs in a terminal: this agent's Windows launcher cannot stream into the sidebar." });
  return notes;
}

/** Forgets that the data note was shown, for the e2e tests. */
export function resetDataNote(context: vscode.ExtensionContext, shown: boolean): Thenable<void> {
  return context.globalState.update(DATA_NOTE_KEY, shown);
}

/** Generate with `focus`, once the notes were stated or confirmed. */
export function launchGenerate(context: vscode.ExtensionContext, runs: Runs, root: string, agent: Agent, focus: string, mode: RunMode): Promise<void> {
  return launchTask(context, runs, root, agent, generateTask(focus), mode);
}

/**
 * Launches the agent once the notes were stated (sidebar) or confirmed (palette): repairs the
 * skill, records the data note as shown, remembers the agent, and starts the run.
 */
export async function launchTask(context: vscode.ExtensionContext, runs: Runs, root: string, agent: Agent, task: LaunchTask, mode: RunMode): Promise<void> {
  if (!(await ensureSkillIntact(context.extensionUri, root, agent.cli, task.skill, false))) return;
  await context.globalState.update(DATA_NOTE_KEY, true);
  await rememberAgent(context, agent.cli);
  const prompt = skillPrompt(agent.cli, task.skill, task.args);

  const binary = findOnPath(agent.cli, process.env);
  if (!binary) {
    const action = await vscode.window.showWarningMessage(`\`${agent.cli}\` was not found on PATH.`, "Copy prompt");
    if (action === "Copy prompt") await vscode.env.clipboard.writeText(prompt);
    return;
  }
  try {
    ensureGitExclude(root);
  } catch (error) {
    void vscode.window.showWarningMessage(`Draft and page files may show up in git status: ${(error as Error).message}`);
  }
  const request = { root, focus: task.title, agent: { cli: agent.cli, label: agent.label }, task };
  if (mode === "sidebar" && canRunHeadless(binary)) {
    const skillDir = join(skillBase(configuredScope(), root), agent.cli === "claude" ? ".claude" : ".agents", "skills", task.skill);
    const args = headlessArgs(agent.cli, prompt, { skillDir, scripts: SKILL_SCRIPTS[task.skill] });
    runs.startHeadless(request, binary, args, agent.cli === "claude" ? claudeParser() : codexParser());
    return;
  }
  const terminal = vscode.window.createTerminal({ name: `Sustain: ${agent.label}`, cwd: root, shellPath: binary, shellArgs: agentLaunchArgs(prompt) });
  terminal.show();
  runs.startTerminal(request, terminal);
}

/** `Sustain: Generate Architecture`: the focus, then the agent and notes as {@link confirmAndLaunch} asks. */
export async function generateArchitectureCommand(context: vscode.ExtensionContext, runs: Runs): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const focus = await vscode.window.showInputBox({ prompt: "Focus (optional)" });
  if (focus === undefined) return;
  await confirmAndLaunch(context, runs, folder.uri.fsPath, generateTask(focus));
}

/**
 * The agent when several are found (or none, to explain the missing CLI), one modal for any
 * notes, then the launch. A `preferred` agent that is found skips the pick.
 */
export async function confirmAndLaunch(context: vscode.ExtensionContext, runs: Runs, root: string, task: LaunchTask, preferred?: "claude" | "codex"): Promise<void> {
  const found = foundAgents();
  let agent: Agent | undefined;
  const only = found.length === 1 ? found[0]!.cli : found.find((entry) => entry.cli === preferred)?.cli;
  if (only !== undefined) {
    agent = AGENTS.find((entry) => entry.cli === only);
  } else {
    const last = chosenAgent(context, found);
    const ordered = [...AGENTS].sort((a, b) => Number(b.cli === last) - Number(a.cli === last));
    const picked = await vscode.window.showQuickPick(
      ordered.map((entry) => ({ label: entry.label, agent: entry })),
      { placeHolder: "Agent" },
    );
    agent = picked?.agent;
  }
  if (!agent) return;

  const mode = configuredRunMode();
  const notes = launchNotes(context, root, agent.cli, mode, found.find((entry) => entry.cli === agent.cli)?.headless ?? true, task.skill);
  if (notes.length > 0) {
    const ask = notes.some((note) => note.kind === "repair") ? vscode.window.showWarningMessage : vscode.window.showInformationMessage;
    const verb = task.skill === "sustain-refresh" ? "Refresh" : "Generate";
    const choice = await ask(`${verb} with ${agent.label}?`, { modal: true, detail: notes.map((note) => note.text).join("\n\n") }, verb);
    if (choice !== verb) return;
  }
  await launchTask(context, runs, root, agent, task, mode);
}
