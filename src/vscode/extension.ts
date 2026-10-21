import * as vscode from "vscode";
import type { SessionWebviewMessage } from "../learn/protocol";
import type { WebviewMessage } from "../viewer/protocol";
import type { HomeState, HomeWebviewMessage, RunCard } from "./sidebar/protocol";
import type { UsageEvent, UsageLog } from "./usageCounts";
import { writeAgentNotesCommand } from "./agentNotes";
import { copyPromptForCommand } from "./copyPrompt";
import { removeSustainCommand } from "./removeSustain";
import { countUsage, UsageLogService } from "./usageLog";
import { registerPreviews } from "./previewWrite";
import { RulesService } from "./rules";
import { forbidArrowCommand, onlyAllowFromCommand, routeThroughCommand, suggestRulesCommand } from "./ruleCommands";
import { generateArchitectureCommand, resetDataNote } from "./generate";
import { HOME_VIEW, HomeView } from "./home";
import { removeHooksWhenIdle } from "../extension/hooksFiles";
import { installSkillsCommand } from "./install";
import { startLearningSessionCommand } from "../extension/learn";
import { openArchitectureCommand } from "./open";
import { Runs } from "./runs";
import { SessionPanel } from "../extension/sessionPanel";
import { SessionWatcher } from "../extension/sessionWatcher";
import { mapFolderCommand, openBoxCodeCommand, showInMapCommand } from "./showInMap";
import { StatusItem } from "./statusBar";
import { ArchitectureEditorProvider, ArchitectureViewer } from "./viewer";
import { CandidateWatcher } from "./watcher";

/** One open viewer tab as the e2e tests see it. */
export interface ViewerState {
  file: string;
  /** The baseline diagram file (FR-CMP-05), or `null` without a comparison. */
  baseline: string | null;
  /** The viewer's tab is the active editor. */
  active: boolean;
  /** `meta.title` of the shown diagram; `undefined` without one or in the empty state. */
  title: string | undefined;
}

/** Returned by `activate()` for the e2e tests only (FR-TEST-01); not a user-facing API. */
export interface TestHook {
  /** Every open .sir viewer, in the order they were opened (FR-CMP). */
  viewers(): ViewerState[];
  /** The usage log (SET-05). */
  usageLog(): UsageLog;
  /**
   * Delivers `message` as if the webview of a viewer of `file` had posted it (the active one
   * first); resolves when it has been handled. Throws when no viewer shows `file`.
   */
  postFromWebview(file: string, message: WebviewMessage): Promise<void>;
  sessionPanelState(): { open: boolean };
  postFromSessionWebview(message: SessionWebviewMessage): Promise<void>;
  /** The sidebar's state, and whether its webview has been created and shows. */
  homeState(): { resolved: boolean; visible: boolean; state: HomeState | null };
  postFromHome(message: HomeWebviewMessage): Promise<void>;
  runCard(): RunCard | null;
  statusText(): string;
  /** Sets whether the first-run data note counts as shown (SET-03). */
  setDataNoteShown(shown: boolean): Thenable<void>;
}

export function activate(context: vscode.ExtensionContext): TestHook {
  const { extensionUri } = context;
  // Hooks left by a session that ended while VS Code was closed go now.
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    try {
      removeHooksWhenIdle(folder.uri.fsPath);
    } catch {
      // A corrupt hooks file stays as the user left it.
    }
  }
  const runs = new Runs(extensionUri);
  const candidates = new CandidateWatcher((root) => runs.runningRoot === root && runs.current?.mode === "sidebar");
  const sessions = new SessionWatcher();
  const rules = new RulesService();
  // SET-05: counted commands add to the usage log while it is on.
  const usage = new UsageLogService(context);
  const counted = <A extends unknown[], R>(event: UsageEvent, run: (...args: A) => R) => (...args: A): R => {
    countUsage(event);
    return run(...args);
  };
  const home = new HomeView(context, runs, rules, [candidates.onDidChange, sessions.onDidChange]);
  const status = new StatusItem(runs);
  const running = runs.onDidChange(() => void vscode.commands.executeCommand("setContext", "sustain.running", runs.current?.status === "running"));
  context.subscriptions.push(
    ArchitectureEditorProvider.register(extensionUri),
    registerPreviews(),
    runs,
    rules,
    candidates,
    sessions,
    home,
    status,
    running,
    vscode.window.registerWebviewViewProvider(HOME_VIEW, home),
    vscode.commands.registerCommand("sustain.installSkills", () => installSkillsCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.generateArchitecture", counted("generate", () => generateArchitectureCommand(context, runs))),
    vscode.commands.registerCommand("sustain.openArchitecture", () => openArchitectureCommand()),
    vscode.commands.registerCommand("sustain.startLearning", counted("learn", () => startLearningSessionCommand(extensionUri))),
    vscode.commands.registerCommand("sustain.checkSetup", async () => {
      await vscode.commands.executeCommand(`${HOME_VIEW}.focus`);
      await home.checkSetup();
    }),
    vscode.commands.registerCommand("sustain.refreshHome", () => home.send()),
    vscode.commands.registerCommand("sustain.cancelRun", () => runs.cancel()),
    vscode.commands.registerCommand("sustain.showInMap", (uri?: vscode.Uri) => showInMapCommand(uri)),
    vscode.commands.registerCommand("sustain.showFileInMap", (uri?: vscode.Uri) => showInMapCommand(uri)),
    vscode.commands.registerCommand("sustain.mapFolder", (uri?: vscode.Uri) => mapFolderCommand(context, runs, uri)),
    vscode.commands.registerCommand("sustain.openBoxCode", openBoxCodeCommand),
    vscode.commands.registerCommand("sustain.forbidArrow", (arrow?: { from?: unknown; to?: unknown }) => forbidArrowCommand(rules, home.root(), arrow)),
    vscode.commands.registerCommand("sustain.onlyAllowImportsFrom", (box?: { componentId?: unknown }) => onlyAllowFromCommand(rules, home.root(), box)),
    vscode.commands.registerCommand("sustain.routeThrough", (box?: { componentId?: unknown }) => routeThroughCommand(rules, home.root(), box)),
    vscode.commands.registerCommand("sustain.suggestRules", () => suggestRulesCommand(rules, home.root())),
    vscode.commands.registerCommand("sustain.writeAgentNotes", () => writeAgentNotesCommand()),
    vscode.commands.registerCommand("sustain.copyPromptFor", counted("copyPrompt", () => copyPromptForCommand(extensionUri))),
    vscode.commands.registerCommand("sustain.removeSustain", () => removeSustainCommand()),
    vscode.commands.registerCommand("sustain.exportUsageLog", () => usage.exportLog()),
    vscode.commands.registerCommand("sustain.clearUsageLog", () => usage.clear()),
  );
  return {
    viewers: () =>
      ArchitectureViewer.all().map((viewer) => ({ file: viewer.file, baseline: viewer.baseline, active: viewer.panel.active, title: viewer.title })),
    usageLog: () => usage.read(),
    postFromWebview: async (file: string, message: WebviewMessage) => {
      const candidatesForFile = ArchitectureViewer.all().filter((viewer) => viewer.file === file);
      const viewer = candidatesForFile.find((candidate) => candidate.panel.active) ?? candidatesForFile[0];
      if (!viewer) throw new Error(`no viewer shows ${file}`);
      await viewer.handleMessage(message);
    },
    sessionPanelState: () => ({ open: SessionPanel.current !== undefined }),
    postFromSessionWebview: async (message) => SessionPanel.current?.handleMessage(message),
    homeState: () => ({ resolved: home.resolved, visible: home.visible, state: home.resolved ? home.state() : null }),
    postFromHome: (message) => home.handleMessage(message),
    runCard: () => runs.current,
    statusText: () => status.text,
    setDataNoteShown: (shown) => resetDataNote(context, shown),
  };
}

export function deactivate(): void {}
