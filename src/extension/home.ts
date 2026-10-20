// UI-01: the Sustain sidebar, a webview view in its own Activity Bar container. It renders the
// HomeState it is sent and posts what the user did; this class does the work.
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { listCandidates } from "../model/discovery";
import { healthItems, type HealthItem, type HealthKind } from "../model/health";
import { listMaps } from "../model/maps";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../model/runFolder";
import type { HomeHostMessage, HomeState, HomeWebviewMessage, MapItem, SessionSummary } from "../model/messages";
import { runPreflight, type Check } from "../model/preflight";
import { assertWritable } from "../model/confine";
import { AGENTS } from "./agents";
import { findDevinCli } from "./devin";
import { launchEstimate } from "./estimates";
import { chosenAgent, configuredRunMode, foundAgents, launchGenerate, launchNotes, launchTask, rememberAgent } from "./generate";
import { webviewHtml } from "./html";
import { installSkill } from "./install";
import { skillStatus } from "./integrity";
import { copyPromptCommand } from "./copyPrompt";
import { countUsage } from "./usageLog";
import type { UsageEvent } from "../model/usageLog";
import type { Runs } from "./runs";
import { suggestRulesCommand } from "./ruleCommands";
import { rulesMap, type RulesService } from "./rules";
import { hotspotDays, hotspotsFor } from "./hotspots";
import { SessionPanel } from "./sessionPanel";
import { readSessionSnapshot } from "./sessionFiles";
import { defaultColumn, showViewer } from "./viewer";

export const HOME_VIEW = "sustain.home";
const ROOT_KEY = "sustain.homeRoot";

/** SET-05: the sidebar actions the usage log counts, by message type. */
const SIDEBAR_USAGE: Partial<Record<HomeWebviewMessage["type"], UsageEvent>> = {
  generate: "generate",
  copyPromptFor: "copyPrompt",
};

/** How long the Health section's measurements are reused (ARC-05). */
const HEALTH_TTL_MS = 5_000;

export class HomeView implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private setup: Check[] | null = null;
  private setupRoot: string | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly healthCache = new Map<string, { at: number; items: HealthItem[] }>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runs: Runs,
    private readonly rules: RulesService,
    changes: vscode.Event<unknown>[],
  ) {
    for (const change of [runs.onDidChange, rules.onDidChange, ...changes]) this.disposables.push(change(() => this.send()));
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
    let confirm = false;
    if (root !== null && agent !== null) {
      try {
        const launch = launchNotes(this.context, root, agent, runMode, agents.find((entry) => entry.cli === agent)?.headless ?? true);
        notes = launch.map((note) => note.text);
        confirm = launch.some((note) => note.confirm === true);
      } catch (error) {
        notes = [(error as Error).message];
      }
    }
    return {
      folders: (vscode.workspace.workspaceFolders ?? []).map((folder) => ({ name: folder.name, root: folder.uri.fsPath })),
      root,
      maps: root === null ? [] : this.mapsOf(root),
      composer: { agents, agent, runMode, notes, confirm },
      run: this.runs.current,
      setup: root === this.setupRoot ? this.setup : null,
      session: root === null ? null : sessionSummary(root),
      rules: root === null ? null : (({ map, rules }) => ({ map, rules }))(this.rules.result(root) ?? { map: null, rules: [], violations: [] }),
      hotspots: root === null ? null : this.hotspots(root),
      health: root === null ? null : this.health(root),
      serverNow: new Date().toISOString(),
    };
  }

  /** ARC-05: each Health line opens its view. */
  private async openHealth(root: string, item: HealthKind): Promise<void> {
    const { map } = rulesMap(root);
    if (item === "violations") {
      await vscode.commands.executeCommand("workbench.actions.view.problems");
      return;
    }
    if (map === null) return;
    await showViewer(join(root, ARCHIFY_DIR, map, CANDIDATE_FILE), { viewColumn: defaultColumn() });
  }

  /** ARC-05: the Health section for `root`'s main map, measured at most every few seconds. */
  private health(root: string): HealthItem[] | null {
    const cached = this.healthCache.get(root);
    if (cached !== undefined && Date.now() - cached.at < HEALTH_TTL_MS) return cached.items;
    const { map, components } = rulesMap(root);
    if (map === null) return null;
    const rules = this.rules.result(root);
    const top = hotspotsFor(root, components).find((box) => box.commits > 0);
    const items = healthItems({
      violations: rules === null || rules.rules.length === 0 ? null : rules.violations.length,
      hotspot: top === undefined ? null : { label: components.find((component) => component.id === top.id)?.label ?? top.id, commits: top.commits },
      days: hotspotDays(),
    });
    this.healthCache.set(root, { at: Date.now(), items });
    return items;
  }

  /** ARC-03: the rules map's five most changed boxes, or `null` without a map. */
  private hotspots(root: string): HomeState["hotspots"] {
    const { map, components } = rulesMap(root);
    if (map === null) return null;
    const labels = new Map(components.map((component) => [component.id, component.label]));
    const boxes = hotspotsFor(root, components).filter((box) => box.commits > 0).slice(0, 5);
    return { days: hotspotDays(), boxes: boxes.map((box) => ({ id: box.id, label: labels.get(box.id) ?? box.id, commits: box.commits, lines: box.lines })) };
  }

  /** The maps list. */
  private mapsOf(root: string): MapItem[] {
    return listMaps(root);
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
    // SET-05: the sidebar's own actions count too; those that run a command are counted there.
    const usage = SIDEBAR_USAGE[message.type];
    if (usage !== undefined) countUsage(usage);
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
        if (!foundAgents().some((agent) => agent.cli === message.agent)) return;
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
        // Above the threshold the sidebar sends a second, confirmed click (CST-03).
        if (agent.cli !== "devin" && launchEstimate(root, agent.cli, "full")?.confirm === true && message.confirmed !== true) return;
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
        if (root !== null && this.isCandidate(root, message.file)) await showViewer(message.file, { viewColumn: defaultColumn() });
        return;
      case "deleteMap":
        if (root !== null && this.isCandidate(root, message.file)) await this.deleteMap(root, message.file);
        return;
      case "suggestRules":
        await suggestRulesCommand(this.rules, root);
        return;
      case "openHealth":
        if (root !== null) await this.openHealth(root, message.item);
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
      case "copyPromptFor":
        if (root !== null) await copyPromptCommand(this.context.extensionUri, root, message.focus);
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
