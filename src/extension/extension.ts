import * as vscode from "vscode";
import type { CheckReport } from "../model/check";
import type { MapDiff } from "../model/diff";
import type { ChangeOverlay, Ghost, HomeState, HomeWebviewMessage, RunCard, SessionWebviewMessage, WebviewMessage } from "../model/messages";
import type { MapFreshness } from "../model/staleness";
import type { TourStop } from "../model/tour";
import { Ask } from "./ask";
import { Practice } from "./practice";
import { showChangesCommand } from "./changes";
import { exportPageCommand } from "./exportPage";
import { refreshArchitectureCommand, refreshBoxCommand } from "./refresh";
import { writeAgentNotesCommand } from "./agentNotes";
import { compareMapsCommand } from "./compare";
import { auditMapCommand } from "./audit";
import { flagBoxCommand } from "./feedback";
import { createTourCommand, playTourCommand } from "./tour";
import { drillDownCommand } from "./drill";
import { copyPromptForCommand } from "./copyPrompt";
import { removeSustainCommand } from "./removeSustain";
import { registerPreviews } from "./previewWrite";
import { Review } from "./review";
import { RulesService } from "./rules";
import { forbidArrowCommand, onlyAllowFromCommand, routeThroughCommand, suggestRulesCommand } from "./ruleCommands";
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
  /** The comparison on the shown map (FRS-07, PRC-03). */
  panelCompare(): { against: string; diff: MapDiff } | null | undefined;
  panelGhosts(): Ghost[] | undefined;
  /** The shown map's tour (SKL-02). */
  panelTour(): TourStop[] | null | undefined;
  /** The run folder of the map the shown drill-down came from (VWR-05). */
  panelOverview(): string | null | undefined;
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
  const rules = new RulesService();
  const practice = new Practice(context);
  const home = new HomeView(context, runs, ask, freshness, review, rules, practice, [candidates.onDidChange, sessions.onDidChange, freshness.onDidChange]);
  const status = new StatusItem(runs);
  const counts = ArchitecturePanel.onDidCountChanges((changed) => (status.changed = changed));
  const toured = ArchitecturePanel.onTourFinished((tour) => void practice.recordTour(tour));
  const running = runs.onDidChange(() => void vscode.commands.executeCommand("setContext", "sustain.running", runs.current?.status === "running"));
  context.subscriptions.push(
    registerPreviews(),
    runs,
    ask,
    practice,
    freshness,
    review,
    ArchitecturePanel.useFreshness(freshness),
    rules,
    ArchitecturePanel.useRules(rules),
    counts,
    toured,
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
    vscode.commands.registerCommand("sustain.forbidArrow", (arrow?: { from?: unknown; to?: unknown }) => forbidArrowCommand(rules, arrow)),
    vscode.commands.registerCommand("sustain.onlyAllowImportsFrom", (box?: { componentId?: unknown }) => onlyAllowFromCommand(rules, box)),
    vscode.commands.registerCommand("sustain.routeThrough", (box?: { componentId?: unknown }) => routeThroughCommand(rules, box)),
    vscode.commands.registerCommand("sustain.suggestRules", () => suggestRulesCommand(rules, home.root())),
    vscode.commands.registerCommand("sustain.writeAgentNotes", () => writeAgentNotesCommand()),
    vscode.commands.registerCommand("sustain.compareMaps", () => compareMapsCommand()),
    vscode.commands.registerCommand("sustain.flagBox", (box?: { componentId?: unknown }) => flagBoxCommand(context, runs, box)),
    vscode.commands.registerCommand("sustain.hideChecks", () => ArchitecturePanel.setChecksShown(false)),
    vscode.commands.registerCommand("sustain.showHotspots", () => ArchitecturePanel.setHotspotsShown(true)),
    vscode.commands.registerCommand("sustain.hideHotspots", () => ArchitecturePanel.setHotspotsShown(false)),
    vscode.commands.registerCommand("sustain.showChecks", () => ArchitecturePanel.setChecksShown(true)),
    vscode.commands.registerCommand("sustain.exportPage", () => exportPageCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.reviewChanges", () => review.command(home.root())),
    vscode.commands.registerCommand("sustain.refreshBox", (box?: { componentId?: unknown }) => refreshBoxCommand(context, runs, box)),
    vscode.commands.registerCommand("sustain.checkUnderstanding", (box?: { componentId?: unknown }) => practice.command(home.root(), box)),
    vscode.commands.registerCommand("sustain.playTour", () => playTourCommand(context, runs)),
    vscode.commands.registerCommand("sustain.find", () => ArchitecturePanel.current?.find()),
    vscode.commands.registerCommand("sustain.drillDown", (box?: { componentId?: unknown }) => drillDownCommand(context, runs, box)),
    vscode.commands.registerCommand("sustain.copyPromptFor", () => copyPromptForCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.removeSustain", () => removeSustainCommand()),
    vscode.commands.registerCommand("sustain.createTour", () => createTourCommand(context, runs)),
  );
  return {
    panelState: () => ({ file: ArchitecturePanel.current?.file, open: ArchitecturePanel.current !== undefined }),
    panelHighlight: () => ArchitecturePanel.current?.highlightState,
    panelFreshness: () => ArchitecturePanel.current?.freshnessState,
    panelChanges: () => ArchitecturePanel.current?.changeOverlay,
    panelCompare: () => ArchitecturePanel.current?.comparison,
    panelGhosts: () => ArchitecturePanel.current?.ghostBoxes,
    panelTour: () => ArchitecturePanel.current?.tourStops,
    panelOverview: () => ArchitecturePanel.current?.overviewParent,
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
