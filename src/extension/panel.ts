// The architecture WebviewPanel (FR-VIEW-04, ADR 0011): one per window, showing one file, and
// compared with a baseline (FR-CMP-05..07, ADR 0031).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, relative, sep } from "node:path";
import * as vscode from "vscode";
import { repoRootFor } from "../model/discovery";
import type { Compare, HostMessage, WebviewMessage } from "../model/messages";
import { parseDiagram, type ViewDiagram } from "../model/tolerant";
import { buildCompare, defaultBaseline, pickerItems, runFolderOf } from "./baseline";
import { webviewHtml } from "./html";
import { openSource, openSourceRef } from "./navigate";

export const VIEW_TYPE = "sustain.architecture";

/** How long the "Can't read baseline" status bar message stays. */
const STATUS_MS = 3_000;

/** What the panel currently shows: a diagram, or an empty state with a message. */
type Shown = { kind: "diagram"; doc: unknown; diagram: ViewDiagram } | { kind: "empty"; message: string };

/** How a file is named in messages: repo-relative when inside the root, else the base name. */
function displayName(root: string, file: string): string {
  const rel = relative(root, file);
  return rel.startsWith("..") || rel === "" ? basename(file) : rel.split(sep).join("/");
}

/** Every `path` of `changes.json` the webview may ask to open (FR-CMP-07). */
function changedPaths(compare: Compare | null): Set<string> {
  const changes = compare?.changes;
  if (!changes) return new Set();
  return new Set([...changes.touchedComponents.flatMap((component) => component.files), ...changes.uncited].map((change) => change.path));
}

export class ArchitecturePanel {
  private static instance: ArchitecturePanel | undefined;

  private shown: Shown = { kind: "empty", message: "" };
  private readonly disposables: vscode.Disposable[] = [];
  /** The `candidate.json` the shown file is compared with (FR-CMP-05), or `null`. */
  private baselineFile: string | null = null;
  /** The baseline was picked (Compare with…, Swap, deletion) rather than defaulted. */
  private baselineChosen = false;
  /** Paths of the `changes.json` last sent; the only ones `openFile` opens. */
  private sentPaths: ReadonlySet<string> = new Set();

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    /** Repo root the shown file's citations resolve against. */
    public root: string,
    /** Absolute path of the shown file. */
    public file: string,
  ) {
    const dist = vscode.Uri.joinPath(extensionUri, "dist");
    panel.webview.options = { enableScripts: true, localResourceRoots: [dist] };
    panel.webview.html = webviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString("base64"),
      scriptUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "webview.js")).toString(),
      styleUri: panel.webview.asWebviewUri(vscode.Uri.joinPath(dist, "webview.css")).toString(),
    });
    this.disposables.push(
      panel.webview.onDidReceiveMessage((message: WebviewMessage) => void this.handleMessage(message)),
      // retainContextWhenHidden is false: the webview restarts when shown again and
      // also asks with "ready"; re-sending here covers a webview that kept its page.
      panel.onDidChangeViewState(({ webviewPanel }) => {
        if (webviewPanel.visible) this.send();
      }),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  /** The open panel, if any. */
  static get current(): ArchitecturePanel | undefined {
    return ArchitecturePanel.instance;
  }

  /** Opens (or reveals and reloads) the panel on `file`, whose citations resolve against `root`. */
  static show(extensionUri: vscode.Uri, root: string, file: string): ArchitecturePanel {
    const existing = ArchitecturePanel.instance;
    if (existing) {
      existing.panel.reveal(existing.panel.viewColumn);
      existing.showFile(root, file);
      return existing;
    }
    const column = vscode.window.visibleTextEditors.length === 0 ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Architecture", column, { retainContextWhenHidden: false });
    const created = new ArchitecturePanel(panel, extensionUri, root, file);
    ArchitecturePanel.instance = created;
    created.reload();
    return created;
  }

  /** The baseline `candidate.json` (FR-CMP-05), or `null` without a comparison. */
  get baseline(): string | null {
    return this.baselineFile;
  }

  /**
   * Switches the open panel to `file` (resolved against `root`) without revealing it. A different
   * file gets its default baseline (FR-CMP-05) unless `baseline` chooses one (Swap); the same
   * file keeps its baseline.
   */
  showFile(root: string, file: string, baseline?: string): void {
    if (baseline !== undefined) {
      this.baselineFile = baseline;
      this.baselineChosen = true;
    } else if (file !== this.file) {
      this.baselineChosen = false;
    }
    this.root = root;
    this.file = file;
    this.reload();
  }

  /**
   * Reads the file again and sends it (or an empty state) to the webview. A chosen baseline is
   * kept; otherwise the default baseline is taken again, which is the same one unless the run's
   * lineage changed.
   */
  reload(): void {
    const name = displayName(this.root, this.file);
    let text: string;
    try {
      text = readFileSync(this.file, "utf8");
    } catch (error) {
      this.fail(`Can't show \`${name}\`: ${(error as Error).message}`);
      return;
    }
    const result = parseDiagram(text);
    if (!result.ok) {
      this.fail(`Can't show \`${name}\`: ${result.reason}`);
      return;
    }
    this.panel.title = `Architecture: ${result.diagram.title ?? basename(this.file)}`;
    // The webview gets the parsed JSON only (NFR-SEC-01), never source files.
    this.shown = { kind: "diagram", doc: result.value, diagram: result.diagram };
    if (!this.baselineChosen) this.baselineFile = defaultBaseline(this.root, this.file);
    this.send();
  }

  /** Re-sends the diagram with a fresh comparison (the baseline file changed; FR-CMP-08). */
  refreshCompare(): void {
    this.send();
  }

  /** Drops the baseline (it was deleted; FR-CMP-08) and re-sends the diagram without a comparison. */
  clearBaseline(): void {
    this.baselineFile = null;
    this.baselineChosen = true;
    this.send();
  }

  /** Shows the empty state with `message` (no notification). */
  showEmpty(message: string): void {
    this.shown = { kind: "empty", message };
    this.send();
  }

  private fail(message: string): void {
    void vscode.window.showErrorMessage(message);
    this.panel.title = `Architecture: ${basename(this.file)}`;
    this.showEmpty(message);
  }

  private send(): void {
    let message: HostMessage;
    if (this.shown.kind === "diagram") {
      const compare = this.compare();
      this.sentPaths = changedPaths(compare);
      message = { type: "load", doc: this.shown.doc, file: this.file, compare };
    } else {
      this.sentPaths = new Set();
      message = { type: "empty", message: this.shown.message };
    }
    void this.panel.webview.postMessage(message);
  }

  /** The comparison with the baseline; `null` without one or when it can't be read (FR-CMP-05). */
  private compare(): Compare | null {
    if (this.baselineFile === null) return null;
    const compare = buildCompare(this.root, this.file, this.baselineFile);
    if (!compare) vscode.window.setStatusBarMessage(`Can't read baseline \`${runFolderOf(this.baselineFile)}\``, STATUS_MS);
    return compare;
  }

  /**
   * Handles a message from the webview (also the e2e test hook's entry point). `openSource`
   * uses the diagram the webview was last sent, resolved against the panel's repo root;
   * `openFile` only opens paths of the `changes.json` last sent (FR-CMP-07).
   */
  async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.send();
        return;
      case "openSource": {
        if (this.shown.kind !== "diagram") return;
        const component = this.shown.diagram.components.find((candidate) => candidate.id === message.componentId);
        if (component) await openSource(this.root, component, message.index, this.panel.viewColumn);
        return;
      }
      case "compareWith":
        await this.compareWith();
        return;
      case "openBaseline":
        if (this.baselineFile !== null) this.showFile(repoRootFor(this.baselineFile, this.root), this.baselineFile);
        return;
      case "swap":
        if (this.baselineFile !== null) this.showFile(repoRootFor(this.baselineFile, this.root), this.baselineFile, this.file);
        return;
      case "openFile":
        if (this.sentPaths.has(message.path)) await openSourceRef(this.root, { path: message.path }, this.panel.viewColumn);
        else console.warn(`Sustain: ignored openFile for a path not in the changes sent: ${message.path}`);
        return;
    }
  }

  /** FR-CMP-06: picks the baseline; Escape changes nothing. */
  private async compareWith(): Promise<void> {
    const file = this.file;
    const choice = await vscode.window.showQuickPick(pickerItems(this.root, file, this.baselineFile), { placeHolder: "Compare with" });
    // The panel may have closed or moved to another file while the picker was open.
    if (!choice || ArchitecturePanel.instance !== this || this.file !== file) return;
    this.baselineFile = choice.file;
    this.baselineChosen = true;
    this.send();
  }

  private dispose(): void {
    if (ArchitecturePanel.instance === this) ArchitecturePanel.instance = undefined;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
