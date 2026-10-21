// SET-05: the opt-in usage log (`sustain.usageLog`, off by default). While it is on, each listed
// action adds one to its count for the day, in VS Code's storage on this machine. Export Usage Log
// saves the log through a save dialog, and Clear Usage Log deletes it.
import * as vscode from "vscode";
import { emptyUsageLog, recordUsage, usageExport, type UsageEvent, type UsageLog } from "./usageCounts";

const LOG_KEY = "sustain.usageLog";

let current: UsageLogService | undefined;

/** Counts `event` when the log is on; the commands and the sidebar call this. */
export function countUsage(event: UsageEvent): void {
  current?.record(event);
}

export class UsageLogService {
  constructor(private readonly context: vscode.ExtensionContext) {
    current = this;
  }

  get enabled(): boolean {
    return vscode.workspace.getConfiguration("sustain").get<boolean>("usageLog", false) === true;
  }

  read(): UsageLog {
    const value = this.context.globalState.get<UsageLog>(LOG_KEY);
    return value?.schema === 1 && typeof value.days === "object" && value.days !== null ? value : emptyUsageLog();
  }

  record(event: UsageEvent): void {
    if (!this.enabled) return;
    void this.context.globalState.update(LOG_KEY, recordUsage(this.read(), event, new Date()));
  }

  /** Export Usage Log: the log as JSON, where the save dialog says. */
  async exportLog(): Promise<void> {
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file("sustain-usage.json"), filters: { JSON: ["json"] }, saveLabel: "Export" });
    if (target === undefined) return;
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(usageExport(this.read())));
    void vscode.window.showInformationMessage("Saved the usage log.");
  }

  /** Clear Usage Log: the log is gone. */
  async clear(): Promise<void> {
    await this.context.globalState.update(LOG_KEY, undefined);
    void vscode.window.showInformationMessage("Cleared the usage log.");
  }
}
