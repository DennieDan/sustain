// UI-02, CST-04: the window's current Generate run, headless or in a terminal, as the sidebar's
// run card. Progress comes from the agent's stream when headless and from run.json always.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { StreamParser } from "../model/agentStream/feed";
import type { RunState } from "../model/agentStream/tracker";
import type { RunEstimate } from "../model/estimate";
import type { ComposerCli, RunCard, RunMode } from "../model/messages";
import { CANDIDATE_FILE } from "../model/runFolder";
import type { LaunchTask } from "./generate";
import { onAction } from "./notify";
import { newRunRecord, newRunSince, RUN_FILE, runFolderNames, updateRunRecord } from "../model/runRecord";
import { startHeadless, type HeadlessRun } from "./runner";
import { defaultColumn, showViewer } from "./viewer";

/** How often run.json is read while a run is going. */
export const RECORD_POLL_MS = 1_000;

/** What started the current run, for "Run in terminal instead". */
export interface RunRequest {
  root: string;
  /** What the card shows: the focus, or what a refresh covers. */
  focus: string;
  agent: { cli: ComposerCli; label: string };
  task: LaunchTask;
  /** The estimate stated before the run (CST-03), or `null` when the folder could not be measured. */
  estimate: RunEstimate | null;
}

export class Runs implements vscode.Disposable {
  private card: RunCard | null = null;
  private request: RunRequest | null = null;
  private before = new Set<string>();
  private headless: HeadlessRun | undefined;
  private terminal: vscode.Terminal | undefined;
  private poll: NodeJS.Timeout | undefined;
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly terminalListener: vscode.Disposable;

  readonly onDidChange = this.changed.event;

  constructor(private readonly extensionUri: vscode.Uri) {
    this.terminalListener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === this.terminal) this.endTerminal();
    });
  }

  get current(): RunCard | null {
    return this.card;
  }

  get lastRequest(): RunRequest | null {
    return this.request;
  }

  /** The folder of the run that is going, if any. */
  get runningRoot(): string | undefined {
    return this.card?.status === "running" ? this.request?.root : undefined;
  }

  private begin(request: RunRequest, mode: RunMode): RunCard {
    this.stop();
    this.request = request;
    this.before = runFolderNames(request.root);
    this.card = {
      agent: request.agent.label,
      mode,
      focus: request.focus.trim(),
      status: "running",
      phase: null,
      attempts: 0,
      runFolder: null,
      feed: [],
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      costUsd: null,
      estimate: request.estimate?.text ?? null,
      denials: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.poll = setInterval(() => this.readRecord(), RECORD_POLL_MS);
    return this.card;
  }

  /** Runs `binary args` headless in the request's folder and streams it into the card. */
  startHeadless(request: RunRequest, binary: string, args: string[], parser: StreamParser): void {
    const card = this.begin(request, "sidebar");
    const run = startHeadless(binary, args, request.root, parser, (state) => {
      if (this.headless !== run) return;
      Object.assign(card, { status: state.status, feed: [...state.feed], usage: state.usage, costUsd: state.costUsd, denials: state.denials, finishedAt: state.finishedAt });
      this.changed.fire();
    });
    this.headless = run;
    this.changed.fire();
    void run.done.then((state) => {
      if (this.headless === run) this.finishHeadless(request, state);
    });
  }

  /** Follows a run in a terminal through its run.json (CST-04). */
  startTerminal(request: RunRequest, terminal: vscode.Terminal): void {
    this.begin(request, "terminal");
    this.terminal = terminal;
    this.changed.fire();
  }

  /** Stops the agent: the process tree when headless, the terminal otherwise. */
  cancel(): void {
    if (this.card?.status !== "running") return;
    if (this.headless) this.headless.cancel();
    else if (this.terminal) this.terminal.dispose();
  }

  /** Clears a finished card. */
  dismiss(): void {
    if (this.card?.status === "running") return;
    this.card = null;
    this.changed.fire();
  }

  /** Copies run.json's phase into the card, and ends a terminal run once it is accepted. */
  private readRecord(): void {
    const card = this.card;
    const request = this.request;
    if (!card || !request) return;
    const found = newRunSince(request.root, this.before);
    if (found === null) return;
    const before = `${card.runFolder}|${card.phase}|${card.attempts}`;
    card.runFolder = found.runFolder;
    card.phase = found.record.phase;
    card.attempts = found.record.attempts;
    if (card.mode === "terminal" && found.record.phase === "accepted" && card.status === "running") {
      card.status = "done";
      card.finishedAt = found.record.finishedAt ?? new Date().toISOString();
      this.record(request, card);
      this.stopPolling();
    }
    if (`${card.runFolder}|${card.phase}|${card.attempts}` !== before) this.changed.fire();
  }

  private finishHeadless(request: RunRequest, state: RunState): void {
    this.stopPolling();
    this.readRecord();
    this.headless = undefined;
    const card = this.card;
    if (!card) return;
    this.record(request, card);
    this.changed.fire();
    if (state.status !== "cancelled" && card.phase === "accepted" && card.runFolder !== null) {
      const file = join(request.root, ".archify", card.runFolder, CANDIDATE_FILE);
      if (existsSync(file)) void showViewer(file, { viewColumn: defaultColumn() });
    }
  }

  private endTerminal(): void {
    this.terminal = undefined;
    const card = this.card;
    if (!card || card.mode !== "terminal" || card.status !== "running") return;
    this.readRecord();
    if (card.status === "running") {
      card.status = card.phase === "rejected" ? "failed" : "cancelled";
      card.finishedAt = new Date().toISOString();
    }
    this.stopPolling();
    this.changed.fire();
  }

  /** Adds what the extension knows to run.json (CST-04): agent, mode, tokens, cost and the estimate (CST-03). */
  private record(request: RunRequest, card: RunCard): void {
    if (card.runFolder === null) return;
    const dir = join(request.root, ".archify", card.runFolder);
    const tokens = card.usage.input + card.usage.output > 0 ? { tokens: { ...card.usage } } : {};
    const cost = card.costUsd === null ? {} : { costUsd: card.costUsd };
    const estimate = request.estimate === null ? {} : { estimate: { ...request.estimate.range, model: request.estimate.model } };
    try {
      updateRunRecord(request.root, dir, { agent: card.agent, mode: card.mode, ...tokens, ...cost, ...estimate }, () => newRunRecord({ focus: card.focus, skillVersion: "unknown" }));
    } catch (error) {
      onAction(vscode.window.showWarningMessage(`Could not record the run in run.json: ${(error as Error).message}`, "Open run.json"), "Open run.json", () =>
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(join(dir, RUN_FILE))),
      );
    }
  }

  private stopPolling(): void {
    clearInterval(this.poll);
    this.poll = undefined;
  }

  private stop(): void {
    this.stopPolling();
    this.headless?.cancel();
    this.headless = undefined;
    this.terminal = undefined;
  }

  dispose(): void {
    this.stop();
    this.terminalListener.dispose();
    this.changed.dispose();
  }
}
