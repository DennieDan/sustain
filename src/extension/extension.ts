import * as vscode from "vscode";
import type { WebviewMessage } from "../model/messages";
import { generateArchitectureCommand } from "./generate";
import { installSkillsCommand } from "./install";
import { openArchitectureCommand, openArchitectureFileCommand } from "./open";
import { ArchitecturePanel } from "./panel";

/** Returned by `activate()` for the e2e tests only (FR-TEST-01); not a user-facing API. */
export interface TestHook {
  panelState(): { file: string | undefined; open: boolean };
  postFromWebview(message: WebviewMessage): void;
}

export function activate(context: vscode.ExtensionContext): TestHook {
  const { extensionUri } = context;
  context.subscriptions.push(
    vscode.commands.registerCommand("sustain.installSkills", () => installSkillsCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.generateArchitecture", () => generateArchitectureCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.openArchitecture", () => openArchitectureCommand(extensionUri)),
    vscode.commands.registerCommand("sustain.openArchitectureFile", () => openArchitectureFileCommand(extensionUri)),
  );
  return {
    panelState: () => ({ file: ArchitecturePanel.current?.file, open: ArchitecturePanel.current !== undefined }),
    postFromWebview: (message) => ArchitecturePanel.current?.handleMessage(message),
  };
}

export function deactivate(): void {}
