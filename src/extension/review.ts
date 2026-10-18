// PRC-02: Review changes in the editor. The user picks a scope; the delta report (PRC-01) fills
// the sidebar's Review section, and the map shows the overlay, stale badges and the new box
// candidates as dashed ghost boxes, which are never written. Each candidate offers Show files,
// Add to map (a refresh limited to its folder) and Ignore (a config change shown as a diff first).
import { basename, dirname, join } from "node:path";
import * as vscode from "vscode";
import { rangeOf } from "../model/changes";
import { mainMap, runCheck, type CheckReport } from "../model/check";
import { CONFIG_FILE, withIgnored } from "../model/config";
import { defaultBranch } from "../model/git";
import type { ReviewView } from "../model/messages";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../model/runFolder";
import { chosenAgent, foundAgents } from "./generate";
import { ArchitecturePanel } from "./panel";
import { configFile, configText, confirmWrite } from "./previewWrite";
import { refreshArchitectureCommand } from "./refresh";
import type { Runs } from "./runs";


const SCOPES = [
  { label: "Uncommitted changes", detail: "The working tree against HEAD", scope: "uncommitted" },
  { label: "This branch", detail: "Against origin/HEAD, main or master, with uncommitted changes", scope: "branch" },
  { label: "Commit range…", detail: "Two revisions, such as main..HEAD", scope: "range" },
] as const;

export class Review implements vscode.Disposable {
  private result: { root: string; scope: string; report: CheckReport } | null = null;
  /** The scope of the last run, so Ignore can run it again. */
  private lastScope: { scope: string; base: string; head: string | undefined } | null = null;
  private error: string | null = null;
  private readonly changed = new vscode.EventEmitter<void>();

  readonly onDidChange = this.changed.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly runs: Runs,
  ) {}

  view(root: string | null): ReviewView | null {
    if (this.error !== null) return { scope: "", error: this.error, counts: null, candidates: [] };
    if (this.result === null || this.result.root !== root) return null;
    const { report, scope } = this.result;
    return {
      scope,
      error: null,
      counts: {
        touched: report.touched.strong.length + report.touched.weak.length,
        stale: report.stale.length,
        gone: report.gone.length,
        uncovered: report.uncovered.length,
        candidates: report.candidates.length,
        arrows: report.arrows.length,
      },
      candidates: report.candidates.map((candidate) => ({ dir: candidate.dir, label: candidate.label, lines: candidate.lines, files: candidate.files.map((file) => file.path) })),
    };
  }

  /** The last report, for the e2e tests. */
  get report(): CheckReport | null {
    return this.result?.report ?? null;
  }

  /** Asks for a scope and runs the check on `root`'s shown or main map. */
  async run(root: string): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      SCOPES.map((entry) => ({ label: entry.label, detail: entry.detail, scope: entry.scope })),
      { placeHolder: "Review which changes?" },
    );
    if (!picked) return;
    let base: string | null;
    let head: string | undefined;
    if (picked.scope === "uncommitted") base = "HEAD";
    else if (picked.scope === "branch") base = defaultBranch(root);
    else {
      const value = await vscode.window.showInputBox({ prompt: "Commit range", placeHolder: "main..HEAD", validateInput: (text) => (rangeOf(text) === null ? "Two revisions separated by .., such as main..HEAD" : undefined) });
      const range = value === undefined ? null : rangeOf(value);
      if (range === null) return;
      base = range.from;
      head = range.to;
    }
    if (base === null) {
      this.fail("No origin/HEAD, main or master to compare this branch with.");
      return;
    }
    await this.check(root, picked.label.replace("…", ""), base, head);
  }

  /** Runs the check with a known scope; Ignore uses it to refresh the lists. */
  async check(root: string, scope: string, base: string, head?: string): Promise<void> {
    const panel = ArchitecturePanel.current;
    const shown = panel !== undefined && panel.root === root && panel.file !== "" ? basename(dirname(panel.file)) : undefined;
    const outcome = runCheck({ root, base, ...(head === undefined ? {} : { head }), ...(shown === undefined ? {} : { map: shown }) });
    if (!outcome.ok) {
      this.fail(outcome.reason);
      return;
    }
    this.error = null;
    this.result = { root, scope, report: outcome.report };
    this.lastScope = { scope, base, head };
    const file = join(root, ARCHIFY_DIR, outcome.report.map, CANDIDATE_FILE);
    const map = ArchitecturePanel.show(this.context.extensionUri, root, file, true);
    const report = outcome.report;
    map.showChanges({ scope, strong: report.touched.strong.map((box) => box.id), weak: report.touched.weak.map((box) => box.id), uncovered: report.uncovered });
    map.showGhosts(
      report.candidates.map((candidate) => ({ label: candidate.label, files: candidate.files.length })),
      report.arrows.map((arrow) => ({ from: arrow.from.id, to: arrow.to.id })),
    );
    this.changed.fire();
  }

  private fail(reason: string): void {
    this.error = reason;
    this.result = null;
    this.changed.fire();
  }

  private candidate(dir: string): CheckReport["candidates"][number] | undefined {
    return this.result?.report.candidates.find((entry) => entry.dir === dir);
  }

  /** Show files: pick one of the candidate's files to open. */
  async showFiles(dir: string): Promise<void> {
    const candidate = this.candidate(dir);
    if (!candidate || !this.result) return;
    const picked = await vscode.window.showQuickPick(
      candidate.files.map((file) => ({ label: file.path, description: `${file.added} lines` })),
      { placeHolder: `Files in ${dir}/` },
    );
    if (picked) await vscode.window.showTextDocument(vscode.Uri.file(join(this.result.root, ...picked.label.split("/"))));
  }

  /** Add to map: a refresh of the reviewed map limited to the candidate's folder. */
  async addToMap(dir: string): Promise<void> {
    if (!this.candidate(dir) || !this.result) return;
    const file = join(this.result.root, ARCHIFY_DIR, this.result.report.map, CANDIDATE_FILE);
    this.runs.dismiss();
    await refreshArchitectureCommand(this.context, this.runs, file, [dir], chosenAgent(this.context, foundAgents()) ?? undefined);
  }

  /** Ignore: shows the config change as a diff, and writes it once confirmed. */
  async ignore(dir: string): Promise<void> {
    if (!this.candidate(dir) || !this.result) return;
    const root = this.result.root;
    const file = configFile(root);
    if (!file.ok) return;
    const written = await confirmWrite({
      root,
      path: file.path,
      before: file.text,
      after: configText(withIgnored(file.config, dir)),
      title: `${CONFIG_FILE}: ignore ${dir}/`,
      question: `Ignore ${dir}/ in ${CONFIG_FILE}?`,
      detail: "Checks will leave its files out of the uncovered changes and new box candidates.",
      verb: "Ignore",
    });
    if (written && this.lastScope) await this.check(root, this.lastScope.scope, this.lastScope.base, this.lastScope.head);
  }

  /** The palette command: the sidebar's folder, else the first workspace folder. */
  async command(root: string | null): Promise<void> {
    if (root === null) {
      void vscode.window.showErrorMessage("Open a folder first.");
      return;
    }
    if (mainMap(root) === null && !ArchitecturePanel.current) {
      void vscode.window.showInformationMessage("Generate a map first. Review compares changes with it.");
      return;
    }
    await this.run(root);
  }

  dispose(): void {
    this.changed.dispose();
  }
}
