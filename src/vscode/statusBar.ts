// UI-04: one right-aligned status bar item. "Sustain" when idle, the run's clock while one goes,
// and the shown map's changed boxes once the change overlay reports them. A click opens the sidebar.
import * as vscode from "vscode";
import { statusText } from "./sidebar/wording";
import type { Runs } from "./runs";

export class StatusItem implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem("sustain.status", vscode.StatusBarAlignment.Right, 100);
  private readonly listener: vscode.Disposable;
  private timer: NodeJS.Timeout | undefined;
  private changedBoxes = 0;

  constructor(private readonly runs: Runs) {
    this.item.name = "Sustain";
    this.item.command = "sustain.home.focus";
    this.item.tooltip = "Open the Sustain sidebar";
    this.listener = runs.onDidChange(() => this.update());
    this.update();
    this.item.show();
  }

  /** The text shown now, for the e2e tests. */
  get text(): string {
    return this.item.text;
  }

  /** Edited or missing boxes in the shown map (FRS-04 reports them). */
  set changed(count: number) {
    this.changedBoxes = count;
    this.update();
  }

  private update(): void {
    const card = this.runs.current;
    const runningSince = card?.status === "running" ? card.startedAt : null;
    const text = statusText({ runningSince, changed: this.changedBoxes }, new Date());
    this.item.text = text === "Sustain" ? "$(type-hierarchy-sub) Sustain" : text;
    if (runningSince !== null && this.timer === undefined) this.timer = setInterval(() => this.update(), 1000);
    if (runningSince === null && this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    clearInterval(this.timer);
    this.listener.dispose();
    this.item.dispose();
  }
}
