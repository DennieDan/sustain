// SKL-01: Explain-back. The user's agent, read-only as Ask runs it (UI-06), writes three questions
// about this branch's changes, the uncommitted changes or one box, and grades each answer in a run of
// its own. The expected answers stay in this host: the sidebar gets the questions, the user's answers
// and the grades. Checks are kept in workspace state and never leave the machine.
import { readFileSync, realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import * as vscode from "vscode";
import { claudeParser } from "../model/agentStream/claude";
import { codexParser } from "../model/agentStream/codex";
import type { RunState } from "../model/agentStream/tracker";
import { citable } from "../model/citations";
import { listCandidates } from "../model/discovery";
import { diffFor } from "../model/git";
import type { PracticeView } from "../model/messages";
import { changedFiles, checkView, gradePrompt, parseGrade, parseQuestions, questionsPrompt, type PracticeCheck, type PracticeSubject } from "../model/practice";
import { parseDiagram, type ViewComponent } from "../model/tolerant";
import { findOnPath, headlessArgs } from "./agents";
import { launchEstimate } from "./estimates";
import { chosenAgent, foundAgents } from "./generate";
import { ArchitecturePanel } from "./panel";
import { startHeadless, type HeadlessRun } from "./runner";

const STATE_KEY = "sustain.practice";
/** Checks kept per workspace. */
export const PRACTICE_LIMIT = 50;

export type PracticeScope = "branch" | "uncommitted" | "box";

const SCOPES: readonly { scope: PracticeScope; label: string }[] = [
  { scope: "branch", label: "This branch's changes" },
  { scope: "uncommitted", label: "Uncommitted changes" },
  { scope: "box", label: "A box of the map" },
];

export class Practice implements vscode.Disposable {
  private checks: PracticeCheck[];
  private run: HeadlessRun | undefined;
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    // A run still going when VS Code closed has no reply coming.
    this.checks = context.workspaceState.get<PracticeCheck[]>(STATE_KEY, []).map((check) => ({
      ...check,
      status: check.status === "running" ? "cancelled" : check.status,
      questions: check.questions.map((entry) => (entry.status === "grading" ? { ...entry, status: "open" } : entry)),
    }));
  }

  get running(): boolean {
    return this.run !== undefined;
  }

  /** The latest check of `root`. */
  private latest(root: string): PracticeCheck | undefined {
    return this.checks.findLast((check) => check.root === root);
  }

  private agent(): "claude" | "codex" | null {
    return chosenAgent(this.context, foundAgents());
  }

  private blocked(root: string | null): string | null {
    if (root === null) return "Open a folder to check your understanding of it.";
    const agents = foundAgents();
    const cli = chosenAgent(this.context, agents);
    if (cli === null) return "Explain-back needs Claude Code or Codex on PATH.";
    if (agents.find((agent) => agent.cli === cli)?.headless === false) return "Explain-back needs an agent that can run in the sidebar. This one's Windows launcher cannot.";
    return null;
  }

  /** Whether one run of a check needs a second click (CST-03). */
  needsConfirm(root: string): boolean {
    const cli = this.agent();
    return cli !== null && launchEstimate(root, cli, "ask")?.confirm === true;
  }

  view(root: string | null): PracticeView {
    const blocked = this.blocked(root);
    const cli = this.agent();
    const estimate = root === null || blocked !== null || cli === null ? null : launchEstimate(root, cli, "ask");
    const check = root === null ? undefined : this.latest(root);
    let rootReal: string | null = null;
    try {
      if (root !== null) rootReal = realpathSync(root);
    } catch {
      rootReal = null;
    }
    return {
      blocked,
      estimate: estimate === null ? null : `${estimate.text}, for the questions and for each grade.`,
      confirm: estimate?.confirm ?? false,
      check: check === undefined ? null : checkView(check, (path) => rootReal !== null && citable(rootReal, path)),
    };
  }

  /** The map a box comes from and the prompt names: the one the panel shows for `root`, else the newest. */
  private mapFor(root: string): string | undefined {
    const panel = ArchitecturePanel.current;
    if (panel && panel.root === root && panel.file !== "") return panel.file;
    return listCandidates(root)[0]?.file;
  }

  private boxes(map: string): ViewComponent[] {
    try {
      const result = parseDiagram(readFileSync(map, "utf8"));
      return result.ok ? result.diagram.components : [];
    } catch {
      return [];
    }
  }

  /** What the check asks about, `null` when the user cancelled a pick, or why there is nothing to ask about. */
  private async subject(root: string, scope: PracticeScope, boxId?: string): Promise<{ label: string; subject: PracticeSubject } | { error: string } | null> {
    if (scope === "box") {
      const map = this.mapFor(root);
      if (map === undefined) return { error: "Generate a map first. Explain-back asks about one of its boxes." };
      const boxes = this.boxes(map).filter((box) => box.sources.length > 0);
      let box = boxes.find((entry) => entry.id === boxId);
      if (box === undefined) {
        const picked = await vscode.window.showQuickPick(
          boxes.map((entry) => ({ label: entry.label, description: entry.id, box: entry })),
          { placeHolder: "Which box should the questions be about?" },
        );
        if (!picked) return null;
        box = picked.box;
      }
      return { label: `Box: ${box.label}`, subject: { kind: "box", label: box.label, sources: box.sources } };
    }
    const diff = diffFor(root, { kind: scope });
    if (!diff.ok) return { error: diff.reason };
    const files = changedFiles(diff.text, diff.untracked);
    const label = scope === "branch" ? "This branch's changes" : "Uncommitted changes";
    if (files.length === 0) return { error: `${label}: there is nothing to ask about.` };
    return { label, subject: { kind: "changes", name: scope === "branch" ? "this branch's changes" : "the uncommitted changes", files } };
  }

  /** Runs the chosen agent read-only on `prompt` and waits for it. */
  private async ask(root: string, cli: "claude" | "codex", prompt: string): Promise<RunState | null> {
    const binary = findOnPath(cli, process.env);
    if (binary === undefined) return null;
    const run = startHeadless(binary, headlessArgs(cli, prompt, { skillDir: "", readOnly: true }), root, cli === "claude" ? claudeParser() : codexParser(), () => {});
    this.run = run;
    try {
      return await run.done;
    } finally {
      this.run = undefined;
    }
  }

  /** Asks the agent for three questions about `scope`; above the threshold only once `confirmed` (CST-03). */
  async start(root: string, scope: PracticeScope, confirmed = false, boxId?: string): Promise<void> {
    if (this.run !== undefined || this.blocked(root) !== null) return;
    if (this.needsConfirm(root) && !confirmed) return;
    const cli = this.agent()!;
    const found = await this.subject(root, scope, boxId);
    if (found === null) return;
    const check: PracticeCheck = { root, scope: "error" in found ? SCOPES.find((entry) => entry.scope === scope)!.label : found.label, agent: cli === "claude" ? "Claude Code" : "Codex", status: "running", error: null, startedAt: new Date().toISOString(), questions: [] };
    this.checks.push(check);
    if ("error" in found) {
      Object.assign(check, { status: "failed", error: found.error });
      await this.save();
      return;
    }
    this.changed.fire();
    const map = this.mapFor(root);
    const state = await this.ask(root, cli, questionsPrompt(found.subject, map === undefined ? null : relative(root, map).split(sep).join("/")));
    check.status = state?.status ?? "failed";
    if (state?.status === "done") {
      const parsed = parseQuestions(state.answer);
      if (parsed.ok) check.questions = parsed.questions.map((entry) => ({ ...entry, answer: null, status: "open", grade: null, error: null }));
      else Object.assign(check, { status: "failed", error: parsed.reason });
    } else if (check.status === "failed") {
      check.error = state?.feed.findLast((item) => item.kind === "error")?.text ?? "The agent stopped without questions.";
    }
    await this.save();
  }

  /** Grades the user's `answer` to question `index` of `root`'s latest check. */
  async answer(root: string, index: number, answer: string): Promise<void> {
    const check = this.latest(root);
    const entry = Number.isInteger(index) ? check?.questions[index] : undefined;
    if (this.run !== undefined || entry === undefined || answer.trim() === "" || (entry.status !== "open" && entry.status !== "failed") || this.blocked(root) !== null) return;
    Object.assign(entry, { answer: answer.trim(), status: "grading", error: null });
    this.changed.fire();
    const state = await this.ask(root, this.agent()!, gradePrompt(entry, entry.answer!));
    const parsed = state?.status === "done" ? parseGrade(state.answer) : null;
    if (parsed?.ok) Object.assign(entry, { status: "graded", grade: parsed.grade });
    else {
      const error = parsed !== null ? parsed.reason : state?.status === "cancelled" ? "Grading was stopped." : (state?.feed.findLast((item) => item.kind === "error")?.text ?? "The agent stopped without a grade.");
      Object.assign(entry, { status: "failed", error });
    }
    await this.save();
  }

  cancel(): void {
    this.run?.cancel();
  }

  /** Forgets `root`'s latest check. */
  async clear(root: string): Promise<void> {
    const check = this.latest(root);
    if (this.run !== undefined || check === undefined) return;
    this.checks = this.checks.filter((entry) => entry !== check);
    await this.save();
  }

  /** `Sustain: Check My Understanding` from the palette, or from a box's menu with `box`. */
  async command(root: string | null, box?: { componentId?: unknown }): Promise<void> {
    const panel = ArchitecturePanel.current;
    const boxId = typeof box?.componentId === "string" ? box.componentId : undefined;
    const folder = boxId !== undefined && panel !== undefined ? panel.root : root;
    const blocked = this.blocked(folder);
    if (blocked !== null || folder === null) {
      void vscode.window.showInformationMessage(blocked ?? "Open a folder first.");
      return;
    }
    let scope: PracticeScope = "box";
    if (boxId === undefined) {
      const picked = await vscode.window.showQuickPick(SCOPES.map((entry) => ({ label: entry.label, scope: entry.scope })), { placeHolder: "Check your understanding of…" });
      if (!picked) return;
      scope = picked.scope;
    }
    const confirm = this.needsConfirm(folder);
    if (confirm) {
      const text = this.view(folder).estimate ?? "";
      const choice = await vscode.window.showInformationMessage("Check your understanding?", { modal: true, detail: text }, "Start");
      if (choice !== "Start") return;
    }
    await vscode.commands.executeCommand("sustain.home.focus");
    await this.start(folder, scope, confirm, boxId);
  }

  private async save(): Promise<void> {
    this.checks = this.checks.slice(-PRACTICE_LIMIT);
    await this.context.workspaceState.update(STATE_KEY, this.checks);
    this.changed.fire();
  }

  dispose(): void {
    this.run?.cancel();
    this.changed.dispose();
  }
}
