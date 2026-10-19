import * as vscode from "vscode";
import type { WebviewMessage } from "../model/messages";
import { generateArchitectureCommand } from "./generate";
import { installSkillsCommand } from "./install";
import { openArchitectureCommand } from "./open";
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
  /** Every open viewer, in the order they were opened. */
  viewers(): ViewerState[];
  /**
   * Delivers `message` as if the webview of a viewer of `file` had posted it (the active one
   * first); resolves when it has been handled. Throws when no viewer shows `file`.
   */
  postFromWebview(file: string, message: WebviewMessage): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): TestHook {
  const { extensionUri } = context;
  context.subscriptions.push(
    ArchitectureEditorProvider.register(extensionUri),
    new CandidateWatcher(),
    vscode.commands.registerCommand("sustain.installSkills", () => installSkillsCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.generateArchitecture", () => generateArchitectureCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.openArchitecture", () => openArchitectureCommand()),
  );
  return {
    viewers: () =>
      ArchitectureViewer.all().map((viewer) => ({ file: viewer.file, baseline: viewer.baseline, active: viewer.panel.active, title: viewer.title })),
    postFromWebview: async (file, message) => {
      const viewers = ArchitectureViewer.all().filter((viewer) => viewer.file === file);
      const viewer = viewers.find((candidate) => candidate.panel.active) ?? viewers[0];
      if (!viewer) throw new Error(`no viewer shows ${file}`);
      await viewer.handleMessage(message);
    },
  };
}

export function deactivate(): void {}
