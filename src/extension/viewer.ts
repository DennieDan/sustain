// The architecture viewer (FR-VIEW-04, ADR 0033): a read-only custom editor for `*.sir` files.
// Every tab shows one file, compared with its own baseline (FR-CMP-05..07, ADR 0031).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, dirname, relative, sep } from "node:path";
import * as vscode from "vscode";
import { repoRootFor } from "../core-node/discovery";
import type { Compare, HostMessage, WebviewMessage } from "../model/messages";
import { parseDiagram, type ViewDiagram } from "../core/tolerant";
import { buildCompare, defaultBaseline, pickerItems, runFolderOf } from "./baseline";
import { webviewHtml } from "./html";
import { openSource, openSourceRef } from "./navigate";
import type { ViewerFacts } from "./watchLogic";

export const VIEW_TYPE = "sustain.architecture";

/** How long the "Can't read baseline" status bar message stays. */
const STATUS_MS = 3_000;

/** What a viewer currently shows: a diagram, or an empty state with a message. */
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

/**
 * The repo root a viewed file's citations resolve against: `<R>` for `<R>/.archify/<run>/<name>`,
 * else the workspace folder holding the file, else the file's folder.
 */
function rootOf(uri: vscode.Uri): string {
  return repoRootFor(uri.fsPath, vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? dirname(uri.fsPath));
}

/**
 * The column `Sustain: Open Architecture` and the watcher's "Open" use: the active column when no
 * text editor is visible, else beside it (FR-VIEW-04).
 */
export function defaultColumn(): vscode.ViewColumn {
  return vscode.window.visibleTextEditors.length === 0 ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
}

/** Baselines chosen for viewers that are being opened (Swap), by URI; taken by `resolveCustomEditor`. */
const pendingBaselines = new Map<string, string>();

export class ArchitectureViewer {
  private static readonly open = new Set<ArchitectureViewer>();

  private shown: Shown = { kind: "empty", message: "" };
  private readonly disposables: vscode.Disposable[] = [];
  /** The diagram file the shown file is compared with (FR-CMP-05), or `null`. */
  private baselineFile: string | null = null;
  /** The baseline was picked (Compare with…, Swap, deletion) rather than defaulted. */
  private baselineChosen = false;
  /** Paths of the `changes.json` last sent; the only ones `openFile` opens. */
  private sentPaths: ReadonlySet<string> = new Set();

  constructor(
    readonly panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    /** Repo root the shown file's citations resolve against. */
    readonly root: string,
    /** Absolute path of the shown file. */
    readonly file: string,
    /** A chosen baseline (Swap); otherwise the file's default baseline applies. */
    baseline: string | undefined,
  ) {
    if (baseline !== undefined) {
      this.baselineFile = baseline;
      this.baselineChosen = true;
    }
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
    ArchitectureViewer.open.add(this);
    this.reload();
  }

  /** Every open viewer, in the order they were opened. */
  static all(): ArchitectureViewer[] {
    return [...ArchitectureViewer.open];
  }

  /** The baseline file (FR-CMP-05), or `null` without a comparison. */
  get baseline(): string | null {
    return this.baselineFile;
  }

  /** `meta.title` of the shown diagram; `undefined` without a title or in the empty state. */
  get title(): string | undefined {
    return this.shown.kind === "diagram" ? this.shown.diagram.title : undefined;
  }

  /** What the watcher needs to know about this viewer (FR-WAT-01, FR-CMP-08). */
  get facts(): ViewerFacts {
    return { root: this.root, file: this.file, baseline: this.baselineFile, visible: this.panel.visible };
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
      this.fail(name, (error as Error).message);
      return;
    }
    const result = parseDiagram(text);
    if (!result.ok) {
      this.fail(name, result.reason);
      return;
    }
    // The webview gets the parsed JSON only (NFR-SEC-01), never source files.
    this.shown = { kind: "diagram", doc: result.value, diagram: result.diagram };
    if (!this.baselineChosen) this.baselineFile = defaultBaseline(this.root, this.file);
    this.send();
  }

  /** Compares with `file` from now on, or with nothing for `null` (Compare with…, Swap; FR-CMP-06/07). */
  chooseBaseline(file: string | null): void {
    this.baselineFile = file;
    this.baselineChosen = true;
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

  private fail(name: string, reason: string): void {
    void vscode.window.showErrorMessage(`Can't show \`${name}\`: ${reason}`, "Open File").then((action) => {
      if (action === "Open File") void vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(this.file), "default");
    });
    this.showEmpty(`Can't show \`${name}\`: ${reason}`);
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
   * uses the diagram the webview was last sent, resolved against the viewer's repo root;
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
        if (this.baselineFile !== null) await showViewer(this.baselineFile, { viewColumn: this.panel.viewColumn ?? vscode.ViewColumn.Active });
        return;
      case "swap":
        if (this.baselineFile !== null) await showViewer(this.baselineFile, { viewColumn: this.panel.viewColumn ?? vscode.ViewColumn.Active, baseline: this.file });
        return;
      case "openFile":
        if (this.sentPaths.has(message.path)) await openSourceRef(this.root, { path: message.path }, this.panel.viewColumn);
        else console.warn(`Sustain: ignored openFile for a path not in the changes sent: ${message.path}`);
        return;
    }
  }

  /** FR-CMP-06: picks the baseline; Escape changes nothing. */
  private async compareWith(): Promise<void> {
    const choice = await vscode.window.showQuickPick(pickerItems(this.root, this.file, this.baselineFile), { placeHolder: "Compare with" });
    // The viewer may have closed while the picker was open.
    if (!choice || !ArchitectureViewer.open.has(this)) return;
    this.chooseBaseline(choice.file);
  }

  private dispose(): void {
    ArchitectureViewer.open.delete(this);
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}

/**
 * Shows `file` in a viewer. An open viewer of it (the one in `viewColumn` first) is revealed and
 * reloaded, or takes `baseline` when one is given; otherwise a new tab opens in `viewColumn`
 * with `baseline` as its chosen baseline, if given.
 */
export async function showViewer(
  file: string,
  options: { viewColumn: vscode.ViewColumn; preserveFocus?: boolean; baseline?: string },
): Promise<void> {
  const viewers = ArchitectureViewer.all().filter((viewer) => viewer.file === file);
  const existing = viewers.find((viewer) => viewer.panel.viewColumn === options.viewColumn) ?? viewers[0];
  if (existing) {
    existing.panel.reveal(existing.panel.viewColumn, options.preserveFocus);
    if (options.baseline !== undefined) existing.chooseBaseline(options.baseline);
    else existing.reload();
    return;
  }
  const uri = vscode.Uri.file(file);
  const key = uri.toString();
  if (options.baseline !== undefined) pendingBaselines.set(key, options.baseline);
  try {
    await vscode.commands.executeCommand("vscode.openWith", uri, VIEW_TYPE, {
      viewColumn: options.viewColumn,
      preserveFocus: options.preserveFocus ?? false,
      preview: false,
    } satisfies vscode.TextDocumentShowOptions);
  } finally {
    pendingBaselines.delete(key);
  }
}

/** Opens every `*.sir` file as a read-only diagram (ADR 0033). */
export class ArchitectureEditorProvider implements vscode.CustomReadonlyEditorProvider {
  private constructor(private readonly extensionUri: vscode.Uri) {}

  static register(extensionUri: vscode.Uri): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(VIEW_TYPE, new ArchitectureEditorProvider(extensionUri), {
      supportsMultipleEditorsPerDocument: true,
      webviewOptions: { retainContextWhenHidden: false },
    });
  }

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  resolveCustomEditor(document: vscode.CustomDocument, panel: vscode.WebviewPanel): void {
    const key = document.uri.toString();
    const baseline = pendingBaselines.get(key);
    pendingBaselines.delete(key);
    new ArchitectureViewer(panel, this.extensionUri, rootOf(document.uri), document.uri.fsPath, baseline);
  }
}
