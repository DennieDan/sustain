import * as vscode from "vscode";
import { generateArchitectureCommand } from "./generate";
import { installSkillsCommand } from "./install";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("sustain.installSkills", () => installSkillsCommand(context.extensionUri)),
    vscode.commands.registerCommand("sustain.generateArchitecture", () => generateArchitectureCommand(context.extensionUri)),
  );
}

export function deactivate(): void {}
