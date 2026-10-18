import * as vscode from "vscode";
import type { CheckReport } from "../model/check";
import type { ChangeOverlay, Ghost, HomeState, HomeWebviewMessage, RunCard, SessionWebviewMessage, WebviewMessage } from "../model/messages";
import type { MapFreshness } from "../model/staleness";
import { Ask } from "./ask";
import { showChangesCommand } from "./changes";
import { exportPageCommand } from "./exportPage";
import { refreshArchitectureCommand, refreshBoxCommand } from "./refresh";
import { auditMapCommand } from "./audit";
import { Review } from "./review";
import { FreshnessService } from "./freshness";
import { generateArchitectureCommand, resetDataNote } from "./generate";
import { HOME_VIEW, HomeView } from "./home";
import { removeHooksWhenIdle } from "./hooksFiles";
import { installSkillsCommand } from "./install";
import { startLearningSessionCommand } from "./learn";
import { openArchitectureCommand, openArchitectureFileCommand } from "./open";
import { ArchitecturePanel } from "./panel";
import { Runs } from "./runs";
import { SessionPanel } from "./sessionPanel";
import { SessionWatcher } from "./sessionWatcher";
import { mapFolderCommand, openBoxCodeCommand, showInMapCommand } from "./showInMap";
import { StatusItem } from "./statusBar";
import { CandidateWatcher } from "./watcher";

/** Returned by `activate()` for the e2e tests only (FR-TEST-01); not a user-facing API. */
export interface TestHook {
  panelState(): { file: string | undefined; open: boolean };
  /** The boxes the map marks as citing a file, and whether they follow the editor (UI-03). */
  panelHighlight(): { ids: string[]; file: string | null; follow: boolean } | undefined;
  /** How the shown map compares with the code (FRS-03). */
  panelFreshness(): MapFreshness | null | undefined;
  /** The change overlay on the shown map (FRS-04). */
  panelChanges(): ChangeOverlay | null | undefined;
  /** The new box candidates drawn on the map, and the last review's report (PRC-02). */
  panelGhosts(): Ghost[] | undefined;
  reviewReport(): CheckReport | null;
  /** Delivers `message` as if the webview had posted it; resolves when it has been handled. */
  postFromWebview(message: WebviewMessage): Promise<void>;
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
  const candidates = new CandidateWatcher(extensionUri, (root) => runs.runningRoot === root && runs.current?.mode === "sidebar");
  const sessions = new SessionWatcher();
  const ask = new Ask(context, extensionUri);
  const freshness = new FreshnessService();
  const review = new Review(context, runs);
  const home = new HomeView(context, runs, ask, freshness, review, [candidates.onDidChange, sessions.onDidChange, freshness.onDidChange]);
  const status = new StatusItem(runs);
  const counts = ArchitecturePanel.onDidCountChanges((changed) => (status.changed = changed));
  const running = runs.onDidChange(() => void vscode.commands.executeCommand("setContext", "sustain.running", runs.current?.status === "running"));
  context.subscriptions.push(
    runs,
    ask,
    freshness,
    review,
    ArchitecturePanel.useFreshness(freshness),
    counts,
    candidates,
    sessions,
    home,
    status,
    running,
    vscode.window.registerWebviewViewProvider(HOME_VIEW, home),
    vscode.commands.registerCommand("sustain.installSkills", () => installSkillsCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.generateArchitecture", () => generateArchitectureCommand(context, runs)),
    vscode.commands.registerCommand("sustain.openArchitecture", () => openArchitectureCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.openArchitectureFile", () => openArchitectureFileCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.startLearning", () => startLearningSessionCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.checkSetup", async () => {
      await vscode.commands.executeCommand(`${HOME_VIEW}.focus`);
      await home.checkSetup();
    }),
    vscode.commands.registerCommand("sustain.refreshHome", () => home.send()),
    vscode.commands.registerCommand("sustain.cancelRun", () => runs.cancel()),
    vscode.commands.registerCommand("sustain.showInMap", (uri?: vscode.Uri) => showInMapCommand(extensionUri, uri)),
    vscode.commands.registerCommand("sustain.showFileInMap", (uri?: vscode.Uri) => showInMapCommand(extensionUri, uri)),
    vscode.commands.registerCommand("sustain.mapFolder", (uri?: vscode.Uri) => mapFolderCommand(context, runs, uri)),
    vscode.commands.registerCommand("sustain.openBoxCode", openBoxCodeCommand),
    vscode.commands.registerCommand("sustain.showChanges", () => showChangesCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.refreshArchitecture", () => refreshArchitectureCommand(context, runs)),
    vscode.commands.registerCommand("sustain.auditMap", () => auditMapCommand(context, runs)),
    vscode.commands.registerCommand("sustain.hideChecks", () => ArchitecturePanel.setChecksShown(false)),
    vscode.commands.registerCommand("sustain.showChecks", () => ArchitecturePanel.setChecksShown(true)),
    vscode.commands.registerCommand("sustain.exportPage", () => exportPageCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.reviewChanges", () => review.command(home.root())),
    vscode.commands.registerCommand("sustain.refreshBox", (box?: { componentId?: unknown }) => refreshBoxCommand(context, runs, box)),
  );
  return {
    panelState: () => ({ file: ArchitecturePanel.current?.file, open: ArchitecturePanel.current !== undefined }),
    panelHighlight: () => ArchitecturePanel.current?.highlightState,
    panelFreshness: () => ArchitecturePanel.current?.freshnessState,
    panelChanges: () => ArchitecturePanel.current?.changeOverlay,
    panelGhosts: () => ArchitecturePanel.current?.ghostBoxes,
    reviewReport: () => review.report,
    postFromWebview: async (message) => ArchitecturePanel.current?.handleMessage(message),
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
