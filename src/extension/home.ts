// UI-01: the Sustain sidebar, a webview view in its own Activity Bar container. It renders the
// HomeState it is sent and posts what the user did; this class does the work.
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { listMaps } from "../model/maps";
import type { HomeHostMessage, HomeState, HomeWebviewMessage, MapItem, SessionSummary } from "../model/messages";
import { runPreflight, type Check } from "../model/preflight";
import { assertWritable } from "../model/confine";
import { AGENTS } from "./agents";
import type { Ask } from "./ask";
import { changedBoxes, type FreshnessService } from "./freshness";
import { findDevinCli } from "./devin";
import { chosenAgent, configuredRunMode, foundAgents, launchGenerate, launchNotes, launchTask, rememberAgent } from "./generate";
import { webviewHtml } from "./html";
import { installSkill } from "./install";
import { skillStatus } from "./integrity";
import { ArchitecturePanel } from "./panel";
import { refreshArchitectureCommand } from "./refresh";
import type { Runs } from "./runs";
import { SessionPanel } from "./sessionPanel";
import { readSessionSnapshot } from "./sessionFiles";

export const HOME_VIEW = "sustain.home";
const ROOT_KEY = "sustain.homeRoot";

export class HomeView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private setup: Check[] | null = null;
  private setupRoot: string | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runs: Runs,
    private readonly ask: Ask,
    private readonly freshness: FreshnessService,
    changes: vscode.Event<unknown>[],
  ) {
    for (const change of [runs.onDidChange, ask.onDidChange, ...changes]) this.disposables.push(change(() => this.send()));
    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.send()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("sustain")) this.send();
      }),
    );
  }

  /** Whether the sidebar's webview has been created, and whether it shows. */
  get resolved(): boolean {
    return this.view !== undefined;
  }

  get visible(): boolean {
    return this.view?.visible === true;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const dist = vscode.Uri.joinPath(this.context.extensionUri, "dist");
    view.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    view.webview.html = webviewHtml({
      cspSource: view.webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(dist, "sidebar.js")).toString(),
      styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(dist, "sidebar.css")).toString(),
      title: "Sustain",
    });
    view.webview.onDidReceiveMessage((message: HomeWebviewMessage) => void this.handleMessage(message), undefined, this.disposables);
    view.onDidChangeVisibility(() => {
      if (view.visible) this.send();
    }, undefined, this.disposables);
    view.onDidDispose(() => {
      if (this.view === view) this.view = undefined;
    }, undefined, this.disposables);
    void this.checkSetup();
  }

  /** The folder the sidebar works on: the one picked last, else the first workspace folder. */
  root(): string | null {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const picked = this.context.workspaceState.get<string>(ROOT_KEY);
    return folders.find((folder) => folder.uri.fsPath === picked)?.uri.fsPath ?? folders[0]?.uri.fsPath ?? null;
  }

  /** What the sidebar shows now. */
  state(): HomeState {
    const root = this.root();
    const agents = foundAgents();
    const agent = chosenAgent(this.context, agents);
    const runMode = configuredRunMode();
    let notes: string[] = [];
    if (root !== null && agent !== null) {
      try {
        notes = launchNotes(this.context, root, agent, runMode, agents.find((entry) => entry.cli === agent)?.headless ?? true).map((note) => note.text);
      } catch (error) {
        notes = [(error as Error).message];
      }
    }
    return {
      folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => ({ name: folder.name, root: folder.uri.fsPath })),
      root,
      maps: root === null ? [] : this.mapsOf(root),
      composer: { agents, agent, runMode, notes },
      run: this.runs.current,
      setup: root === this.setupRoot ? this.setup : null,
      session: root === null ? null : sessionSummary(root),
      ask: this.ask.view(root),
      serverNow: new Date().toISOString(),
    };
  }

  /** The maps list, each with its changed boxes when it has fingerprints (FRS-03). */
  private mapsOf(root: string): MapItem[] {
    return listMaps(root).map((item) => {
      const state = this.freshness.of(root, item.file);
      return { ...item, changed: state.revision === null && state.citations.length === 0 ? null : changedBoxes(state) };
    });
  }

  /** Sends the current state when the sidebar is showing. */
  send(): void {
    if (!this.view?.visible) return;
    const message: HomeHostMessage = { type: "state", state: this.state() };
    void this.view.webview.postMessage(message);
  }

  /** Runs SET-02's checks for the current folder and shows them. */
  async checkSetup(): Promise<Check[] | null> {
    const root = this.root();
    if (root === null) return null;
    this.setupRoot = root;
    this.setup = null;
    this.send();
    let skillsIntact: boolean;
    try {
      const agent = chosenAgent(this.context, foundAgents()) ?? "claude";
      skillsIntact = skillStatus(this.context.extensionUri, root, agent, "sustain-architecture").differing === 0;
    } catch {
      skillsIntact = false;
    }
    const checks = await runPreflight({ env: process.env, root, skillsIntact, devinPath: findDevinCli(process.env) });
    if (this.setupRoot === root) {
      this.setup = checks;
      this.send();
    }
    return checks;
  }

  /** Handles a message from the sidebar (also the e2e test hook's entry point). */
  async handleMessage(message: HomeWebviewMessage): Promise<void> {
    const root = this.root();
    switch (message.type) {
      case "ready":
        this.send();
        return;
      case "pickFolder":
        await this.context.workspaceState.update(ROOT_KEY, message.root);
        this.send();
        void this.checkSetup();
        return;
      case "setAgent":
        await rememberAgent(this.context, message.agent);
        this.send();
        return;
      case "setRunMode":
        await vscode.workspace.getConfiguration("sustain").update("runMode", message.runMode, vscode.ConfigurationTarget.Global);
        this.send();
        return;
      case "generate": {
        if (root === null) return;
        const cli = chosenAgent(this.context, foundAgents());
        const agent = AGENTS.find((entry) => entry.cli === cli);
        if (!agent) return;
        this.runs.dismiss();
        await launchGenerate(this.context, this.runs, root, agent, message.focus, configuredRunMode());
        this.send();
        return;
      }
      case "cancelRun":
        this.runs.cancel();
        return;
      case "runInTerminal": {
        const last = this.runs.lastRequest;
        const agent = AGENTS.find((entry) => entry.cli === last?.agent.cli);
        if (last && agent) await launchTask(this.context, this.runs, last.root, agent, last.task, "terminal");
        return;
      }
      case "openMap":
        if (root !== null && this.isCandidate(root, message.file)) ArchitecturePanel.show(this.context.extensionUri, root, message.file);
        return;
      case "deleteMap":
        if (root !== null && this.isCandidate(root, message.file)) await this.deleteMap(root, message.file);
        return;
      case "refreshMap":
        if (root !== null && this.isCandidate(root, message.file)) {
          this.runs.dismiss();
          await refreshArchitectureCommand(this.context, this.runs, message.file, [], chosenAgent(this.context, foundAgents()) ?? undefined);
        }
        return;
      case "fix":
        await this.fix(message.check);
        return;
      case "checkSetup":
        await this.checkSetup();
        return;
      case "openSession":
        if (root !== null) SessionPanel.show(this.context.extensionUri, root);
        return;
      case "startLearning":
        await vscode.commands.executeCommand("sustain.startLearning");
        return;
      case "ask":
        if (root !== null) await this.ask.ask(root, message.question);
        return;
      case "cancelAsk":
        this.ask.cancel();
        return;
      case "clearAsk":
        if (root !== null) await this.ask.clear(root);
        return;
      case "openCitation":
        if (root !== null) await this.ask.openCitation(root, message.path, message.line, message.endLine);
        return;
      case "focusBox":
        if (root !== null) this.ask.focusBox(root, message.id);
        return;
    }
  }

  /** Only files the maps list offered are opened or deleted. */
  private isCandidate(root: string, file: string): boolean {
    return listCandidates(root).some((candidate) => candidate.file === file);
  }

  private async deleteMap(root: string, file: string): Promise<void> {
    const folder = dirname(file);
    const choice = await vscode.window.showWarningMessage(`Delete the map in ${vscode.workspace.asRelativePath(folder)}?`, { modal: true, detail: "The whole run folder goes." }, "Delete");
    if (choice !== "Delete") return;
    assertWritable(root, folder);
    rmSync(folder, { recursive: true, force: true });
    if (ArchitecturePanel.current?.file === file) ArchitecturePanel.current.showEmpty("This diagram was deleted.");
    this.send();
  }

  private async fix(id: Check["id"]): Promise<void> {
    const fix = this.setup?.find((check) => check.id === id)?.fix;
    const root = this.root();
    if (!fix || root === null) return;
    if (fix.kind === "install-skills") await installSkill(this.context.extensionUri, root);
    else if (fix.kind === "copy") {
      await vscode.env.clipboard.writeText(fix.text);
      void vscode.window.showInformationMessage(`Copied: ${fix.text}`);
    } else await vscode.env.openExternal(vscode.Uri.parse(fix.url));
    await this.checkSetup();
  }

  dispose(): void {
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}

/** The live learning session in `root`, or `null` when none is running. */
function sessionSummary(root: string): SessionSummary | null {
  const snapshot = readSessionSnapshot(root);
  const session = snapshot.shown?.session;
  if (snapshot.activeRun === null || snapshot.shown?.run !== snapshot.activeRun || !session) return null;
  return { phase: session.phase, stepIndex: session.stepIndex, stepsTotal: session.steps.length, score: session.score };
}
