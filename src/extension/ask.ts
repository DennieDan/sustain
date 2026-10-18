// UI-06: questions about the repository, answered by the user's agent with the map as the guide.
// Claude Code continues one session across follow-ups; Codex answers one question per run. Both
// run read-only. History lives in workspace state.
import { readFileSync, realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import * as vscode from "vscode";
import { NO_USAGE, type StreamUsage } from "../model/agentStream/feed";
import { claudeParser } from "../model/agentStream/claude";
import { codexParser } from "../model/agentStream/codex";
import type { RunStatus } from "../model/agentStream/tracker";
import { askPrompt, keepCites, parseAnswer, type BoxLabel } from "../model/ask";
import { citable } from "../model/citations";
import type { RunEstimate } from "../model/estimate";
import { listCandidates } from "../model/discovery";
import type { AskView } from "../model/messages";
import { parseDiagram } from "../model/tolerant";
import { findOnPath, headlessArgs } from "./agents";
import { launchEstimate } from "./estimates";
import { chosenAgent, chosenHeadless, foundAgents } from "./generate";
import { openSourceRef } from "./navigate";
import { ArchitecturePanel } from "./panel";
import { startHeadless, type HeadlessRun } from "./runner";

const HISTORY_KEY = "sustain.askHistory";
/** Questions kept per workspace. */
export const HISTORY_LIMIT = 20;

interface StoredTurn {
  root: string;
  /** The candidate the question was asked about. */
  map: string;
  question: string;
  agent: string;
  status: RunStatus;
  answer: string;
  usage: StreamUsage;
  costUsd: number | null;
  error: string | null;
}

/** The Claude Code session a follow-up continues. */
interface Conversation {
  root: string;
  map: string;
  sessionId: string;
}

export class Ask implements vscode.Disposable {
  private turns: StoredTurn[];
  private conversation: Conversation | null = null;
  private run: HeadlessRun | undefined;
  private readonly labels = new Map<string, BoxLabel[]>();
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changed.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly extensionUri: vscode.Uri,
  ) {
    // A question still running when VS Code closed has no answer coming.
    this.turns = context.workspaceState.get<StoredTurn[]>(HISTORY_KEY, []).map((turn) => (turn.status === "running" ? { ...turn, status: "cancelled" } : turn));
  }

  /** The map a question is about: the one the panel shows for `root`, else the newest. */
  private mapFor(root: string): string | undefined {
    const panel = ArchitecturePanel.current;
    if (panel && panel.root === root && panel.file !== "") return panel.file;
    return listCandidates(root)[0]?.file;
  }

  private blocked(root: string | null): string | null {
    if (root === null) return "Open a folder to ask about it.";
    if (this.mapFor(root) === undefined) return "Generate a map first. Ask uses it as the guide.";
    const agents = foundAgents();
    const cli = chosenAgent(this.context, agents);
    if (cli === null) return "Ask needs Claude Code or Codex on PATH.";
    if (cli === "devin") return "Ask needs Claude Code or Codex. Devin runs only in a terminal.";
    if (agents.find((agent) => agent.cli === cli)?.headless === false) return "Ask needs an agent that can run in the sidebar. This one's Windows launcher cannot.";
    return null;
  }

  /** What one question costs with the chosen agent (CST-03). */
  private estimate(root: string): RunEstimate | null {
    const cli = chosenHeadless(this.context, foundAgents());
    return cli === null ? null : launchEstimate(root, cli, "ask");
  }

  /** The box labels of `map`, for linking them in answers. */
  private boxes(map: string): BoxLabel[] {
    const cached = this.labels.get(map);
    if (cached) return cached;
    let boxes: BoxLabel[] = [];
    try {
      const result = parseDiagram(readFileSync(map, "utf8"));
      if (result.ok) boxes = result.diagram.components.map((component) => ({ id: component.id, label: component.label }));
    } catch {
      // A map that is gone links no boxes.
    }
    this.labels.set(map, boxes);
    return boxes;
  }

  view(root: string | null): AskView {
    const turns = root === null ? [] : this.turns.filter((turn) => turn.root === root);
    let rootReal: string | null = null;
    try {
      if (root !== null) rootReal = realpathSync(root);
    } catch {
      rootReal = null;
    }
    const checked = new Map<string, boolean>();
    const keep = (path: string): boolean => {
      if (rootReal === null) return false;
      if (!checked.has(path)) checked.set(path, citable(rootReal, path));
      return checked.get(path)!;
    };
    const blocked = this.blocked(root);
    const estimate = root === null || blocked !== null ? null : this.estimate(root);
    return {
      blocked,
      estimate: estimate?.text ?? null,
      confirm: estimate?.confirm ?? false,
      turns: turns.map((turn) => ({
        question: turn.question,
        agent: turn.agent,
        status: turn.status,
        blocks: keepCites(parseAnswer(turn.answer, this.boxes(turn.map)), keep),
        usage: turn.usage,
        costUsd: turn.costUsd,
        error: turn.error,
      })),
    };
  }

  get running(): boolean {
    return this.run !== undefined;
  }

  /** Asks `question` about `root`'s map with the chosen agent; above the threshold only once `confirmed` (CST-03). */
  async ask(root: string, question: string, confirmed = false): Promise<void> {
    if (this.run !== undefined || question.trim() === "" || this.blocked(root) !== null) return;
    if (this.estimate(root)?.confirm === true && !confirmed) return;
    const map = this.mapFor(root)!;
    const cli = chosenHeadless(this.context, foundAgents())!;
    const binary = findOnPath(cli, process.env);
    if (binary === undefined) return;
    const follow = cli === "claude" && this.conversation !== null && this.conversation.root === root && this.conversation.map === map ? this.conversation : null;
    const prompt = askPrompt(relative(root, map).split(sep).join("/"), question, follow !== null);
    const args = headlessArgs(cli, prompt, { skillDir: "", readOnly: true, ...(follow ? { resume: follow.sessionId } : {}) });

    const turn: StoredTurn = { root, map, question: question.trim(), agent: cli === "claude" ? "Claude Code" : "Codex", status: "running", answer: "", usage: { ...NO_USAGE }, costUsd: null, error: null };
    this.turns.push(turn);
    this.labels.delete(map);
    const run = startHeadless(binary, args, root, cli === "claude" ? claudeParser() : codexParser(), (state) => {
      Object.assign(turn, { status: state.status, answer: state.answer, usage: state.usage, costUsd: state.costUsd });
      this.changed.fire();
    });
    this.run = run;
    this.changed.fire();
    const state = await run.done;
    this.run = undefined;
    if (state.status === "failed") turn.error = state.feed.findLast((item) => item.kind === "error")?.text ?? "The agent stopped without an answer.";
    if (cli === "claude" && state.sessionId !== null && state.status === "done") this.conversation = { root, map, sessionId: state.sessionId };
    if (cli === "codex") this.conversation = null;
    await this.save();
    this.changed.fire();
  }

  cancel(): void {
    this.run?.cancel();
  }

  /** Forgets `root`'s questions and the session they were in. */
  async clear(root: string): Promise<void> {
    if (this.run !== undefined) return;
    this.turns = this.turns.filter((turn) => turn.root !== root);
    if (this.conversation?.root === root) this.conversation = null;
    await this.save();
    this.changed.fire();
  }

  /** Opens a cited line, checked again here: the webview's word is not trusted. */
  async openCitation(root: string, path: string, line: number, endLine: number | null): Promise<void> {
    let rootReal: string;
    try {
      rootReal = realpathSync(root);
    } catch {
      return;
    }
    if (!citable(rootReal, path) || !Number.isInteger(line) || line < 1) return;
    await openSourceRef(root, { path, line, ...(endLine !== null && Number.isInteger(endLine) && endLine >= line ? { end_line: endLine } : {}) }, undefined);
  }

  /** Shows `root`'s map with box `id` marked. */
  focusBox(root: string, id: string): void {
    const map = this.mapFor(root);
    if (map === undefined) return;
    ArchitecturePanel.show(this.extensionUri, root, map, true).focusBox(id);
  }

  private save(): Thenable<void> {
    this.turns = this.turns.slice(-HISTORY_LIMIT);
    return this.context.workspaceState.update(HISTORY_KEY, this.turns);
  }

  dispose(): void {
    this.run?.cancel();
    this.changed.dispose();
  }
}
