// Generate (FR-GEN-01, UI-02, SET-03, FR-UPD-08): one click from the sidebar, which states
// beforehand what the click will also do, or the Command Palette, which asks for the focus and
// shows the same notes in one modal. With a previous diagram the palette asks whether to update
// it or regenerate from scratch. The run streams into the sidebar or runs in a terminal
// (ADR 0020).
import { join } from "node:path";
import * as vscode from "vscode";
import { claudeParser } from "../model/agentStream/claude";
import { codexParser } from "../model/agentStream/codex";
import { listCandidates } from "../model/discovery";
import type { ComposerAgent, ComposerCli, RunMode } from "../model/messages";
import { agentLaunchArgs, AGENTS, findOnPath, headlessArgs, SKILL_SCRIPTS, skillPrompt, type Agent, type SkillName } from "./agents";
import { devinPromptArgs, findDevinCli } from "./devin";
import { estimateKind, launchEstimate } from "./estimates";
import { pickRepoRoot } from "./folders";
import { ensureGitExclude } from "./hooksFiles";
import { ensureSkillIntact, skillNote, skillStatus } from "./integrity";
import { onAction } from "./notify";
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

/** `cli`'s executable: on absolute PATH entries (SAF-04), or for Devin also where it installs (RCH-04). */
export function agentBinary(cli: ComposerCli, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return cli === "devin" ? findDevinCli(env) : findOnPath(cli, env);
}

/** The agents found. Devin never streams into the sidebar, so it runs in a terminal (RCH-04). */
export function foundAgents(env: NodeJS.ProcessEnv = process.env): ComposerAgent[] {
  return AGENTS.flatMap((agent) => {
    const binary = agentBinary(agent.cli, env);
    return binary === undefined ? [] : [{ cli: agent.cli, label: agent.label, headless: agent.cli !== "devin" && canRunHeadless(binary) }];
  });
}

/** The remembered agent when it is still found, else the first one found. */
export function chosenAgent(context: vscode.ExtensionContext, agents: readonly ComposerAgent[]): ComposerCli | null {
  const last = context.workspaceState.get<string>(LAST_AGENT_KEY);
  return agents.find((agent) => agent.cli === last)?.cli ?? agents[0]?.cli ?? null;
}

/** The chosen agent when it can answer in the sidebar, as Ask and the explain-back need, else `null`. */
export function chosenHeadless(context: vscode.ExtensionContext, agents: readonly ComposerAgent[]): "claude" | "codex" | null {
  const cli = chosenAgent(context, agents);
  return cli !== "devin" && cli !== null && agents.find((agent) => agent.cli === cli)?.headless === true ? cli : null;
}

export function rememberAgent(context: vscode.ExtensionContext, cli: ComposerCli): Thenable<void> {
  return context.workspaceState.update(LAST_AGENT_KEY, cli);
}

export interface LaunchNote {
  /** A repair means the skill on disk was changed (SAF-01), so the palette asks with a warning. */
  kind: "estimate" | "install" | "repair" | "data" | "terminal";
  text: string;
  /** An estimate above `sustain.confirmAboveTokens`, which needs a second click (CST-03). */
  confirm?: boolean;
}

/** What a run of `skill` will launch: its arguments, and what the run card shows. */
export interface LaunchTask {
  skill: SkillName;
  args: string;
  title: string;
}

/** A Generate with `focus`; `regenerate` (FR-UPD-08) draws from scratch instead of updating the previous diagram. */
export function generateTask(focus: string, regenerate = false): LaunchTask {
  return { skill: "sustain-architecture", args: regenerate ? `--regenerate ${focus.trim()}` : focus.trim(), title: focus.trim() };
}

/**
 * What a run of `skill` with `cli` will spend and also do: the estimate (CST-03), installing or
 * repairing the skill, and the first-run data note (SET-03).
 */
export function launchNotes(context: vscode.ExtensionContext, root: string, cli: ComposerCli, mode: RunMode, headless: boolean, skillName: SkillName = "sustain-architecture"): LaunchNote[] {
  const notes: LaunchNote[] = [];
  const estimate = cli === "devin" ? null : launchEstimate(root, cli, estimateKind(skillName));
  if (estimate !== null) notes.push({ kind: "estimate", text: estimate.text, confirm: estimate.confirm });
  if (cli === "devin") notes.push({ kind: "estimate", text: "Devin runs in its own terminal and reports no tokens to Sustain, so there is no estimate for it." });
  const status = skillStatus(context.extensionUri, root, cli, skillName);
  const skill = skillNote(status, skillName);
  if (skill !== null) notes.push({ kind: status.differing === null ? "install" : "repair", text: skill });
  if (context.globalState.get<boolean>(DATA_NOTE_KEY) !== true) notes.push({ kind: "data", text: DATA_NOTE });
  if (mode === "sidebar" && !headless) notes.push({ kind: "terminal", text: cli === "devin" ? "Runs in a terminal. Devin cannot stream into the sidebar." : "Runs in a terminal: this agent's Windows launcher cannot stream into the sidebar." });
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

  const binary = agentBinary(agent.cli);
  if (!binary) {
    const action = await vscode.window.showWarningMessage(`\`${agent.cli}\` was not found on PATH.`, "Copy prompt");
    if (action === "Copy prompt") await vscode.env.clipboard.writeText(prompt);
    return;
  }
  try {
    ensureGitExclude(root);
  } catch (error) {
    onAction(vscode.window.showWarningMessage(`Draft and page files may show up in git status: ${(error as Error).message}`, "Open Exclude File"), "Open Exclude File", () =>
      vscode.commands.executeCommand("vscode.open", vscode.Uri.file(join(root, ".git", "info", "exclude"))),
    );
  }
  const request = { root, focus: task.title, agent: { cli: agent.cli, label: agent.label }, task, estimate: agent.cli === "devin" ? null : launchEstimate(root, agent.cli, estimateKind(task.skill)) };
  if (mode === "sidebar" && agent.cli !== "devin" && canRunHeadless(binary)) {
    const skillDir = join(skillBase(configuredScope(), root), agent.cli === "claude" ? ".claude" : ".agents", "skills", task.skill);
    const args = headlessArgs(agent.cli, prompt, { skillDir, scripts: SKILL_SCRIPTS[task.skill] });
    runs.startHeadless(request, binary, args, agent.cli === "claude" ? claudeParser() : codexParser());
    return;
  }
  const terminal = vscode.window.createTerminal({ name: `Sustain: ${agent.label}`, cwd: root, shellPath: binary, shellArgs: agent.cli === "devin" ? devinPromptArgs(prompt) : agentLaunchArgs(prompt) });
  terminal.show();
  runs.startTerminal(request, terminal);
}

/**
 * `Sustain: Generate Architecture`: the focus, then with a previous diagram whether to update
 * it or regenerate from scratch (FR-UPD-08), then the agent and notes as
 * {@link confirmAndLaunch} asks.
 */
export async function generateArchitectureCommand(context: vscode.ExtensionContext, runs: Runs): Promise<void> {
  const folder = await pickRepoRoot();
  if (!folder) return;
  const focus = await vscode.window.showInputBox({ prompt: "Focus (optional)" });
  if (focus === undefined) return;
  const root = folder.uri.fsPath;
  let regenerate = false;
  if (listCandidates(root).length > 0) {
    const mode = await vscode.window.showQuickPick(
      [
        { label: "Update the latest diagram", regenerate: false },
        { label: "Regenerate from scratch", regenerate: true },
      ],
      { placeHolder: "Previous diagram" },
    );
    if (!mode) return;
    regenerate = mode.regenerate;
  }
  await confirmAndLaunch(context, runs, root, generateTask(focus, regenerate));
}

/**
 * The agent when several are found (or none, to explain the missing CLI), one modal for any
 * notes, then the launch. A `preferred` agent that is found skips the pick.
 */
export async function confirmAndLaunch(context: vscode.ExtensionContext, runs: Runs, root: string, task: LaunchTask, preferred?: ComposerCli): Promise<void> {
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
  // The estimate alone asks only above the threshold (CST-03); every other note always asks (SET-03).
  if (notes.some((note) => note.kind !== "estimate" || note.confirm === true)) {
    const verb = "Generate";
    const detail = notes.map((note) => note.text).join("\n\n");
    // A repair is a warning; every other note asks as information.
    const choice = notes.some((note) => note.kind === "repair")
      ? await vscode.window.showWarningMessage(`${verb} with ${agent.label}?`, { modal: true, detail }, verb)
      : await vscode.window.showInformationMessage(`${verb} with ${agent.label}?`, { modal: true, detail }, verb);
    if (choice !== verb) return;
  }
  await launchTask(context, runs, root, agent, task, mode);
}
