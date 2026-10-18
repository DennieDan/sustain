// The architecture WebviewPanel (FR-VIEW-04, ADR 0011): one per window, showing one file.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, relative, sep } from "node:path";
import * as vscode from "vscode";
import { citingBoxes } from "../model/citing";
import { freshnessHeader } from "../model/home";
import type { ChangeOverlay, HostMessage, WebviewMessage } from "../model/messages";
import type { MapFreshness } from "../model/staleness";
import { parseDiagram, type ViewDiagram } from "../model/tolerant";
import { changedBoxes, type FreshnessService } from "./freshness";
import { webviewHtml } from "./html";
import { openSource, openSourceRef } from "./navigate";

export const VIEW_TYPE = "sustain.architecture";

/** What the panel currently shows: a diagram, or an empty state with a message and maybe an action. */
type Shown = { kind: "diagram"; doc: unknown; diagram: ViewDiagram } | { kind: "empty"; message: string; action?: "mapFolder" };

export const NO_MAP_MESSAGE = "No map of this folder yet.";

/** `file` relative to `root`, `/`-separated, or `null` when it lies outside. */
function repoRelative(root: string, file: string): string | null {
  const rel = relative(root, file);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? null : rel.split(sep).join("/");
}

/** How a file is named in messages: repo-relative when inside the root, else the base name. */
function displayName(root: string, file: string): string {
  const rel = relative(root, file);
  return rel.startsWith("..") || rel === "" ? basename(file) : rel.split(sep).join("/");
}

export class ArchitecturePanel {
  private static instance: ArchitecturePanel | undefined;
  private static freshnessService: FreshnessService | undefined;
  private static readonly freshnessChanged = new vscode.EventEmitter<number>();

  /** Fires with the shown map's changed boxes whenever they are counted, and 0 when the panel closes (FRS-03). */
  static readonly onDidCountChanges = ArchitecturePanel.freshnessChanged.event;

  /** Gives every panel the service that tells how its map compares with the code. */
  static useFreshness(service: FreshnessService): vscode.Disposable {
    ArchitecturePanel.freshnessService = service;
    return service.onDidChange((root) => {
      if (ArchitecturePanel.instance?.root === root) ArchitecturePanel.instance.sendFreshness();
    });
  }

  private shown: Shown = { kind: "empty", message: "" };
  /** The file whose citing boxes are marked (UI-03), absolute, or `null`. */
  private highlightFile: string | null = null;
  /** Follow editor: the marks move with the active editor. */
  private follow = false;
  /** A box marked on its own, from an Ask answer (UI-06). */
  private focused: string[] = [];
  /** How the shown map compares with the code (FRS-03). */
  private freshness: MapFreshness | null = null;
  /** The boxes a diff touched (FRS-04), until cleared or another file is shown. */
  private changes: ChangeOverlay | null = null;
  private readonly disposables: vscode.Disposable[] = [];

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
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.follow && editor?.document.uri.scheme === "file") this.highlight(editor.document.uri.fsPath);
      }),
      panel.onDidDispose(() => this.dispose()),
    );
  }

  /** The open panel, if any. */
  static get current(): ArchitecturePanel | undefined {
    return ArchitecturePanel.instance;
  }

  /**
   * Opens (or reveals and reloads) the panel on `file`, whose citations resolve against `root`.
   * `preserveFocus` keeps the editor active, for Show in Map (UI-03).
   */
  static show(extensionUri: vscode.Uri, root: string, file: string, preserveFocus = false): ArchitecturePanel {
    const panel = ArchitecturePanel.reveal(extensionUri, root, file, preserveFocus);
    if (panel.file !== file || panel.root !== root || panel.shown.kind !== "diagram") panel.showFile(root, file);
    else panel.reload();
    return panel;
  }

  /** Opens the panel on a folder without a map, offering to map it (UI-03). */
  static showNoMap(extensionUri: vscode.Uri, root: string, preserveFocus = false): ArchitecturePanel {
    const panel = ArchitecturePanel.reveal(extensionUri, root, "", preserveFocus);
    panel.root = root;
    panel.file = "";
    panel.panel.title = "Architecture";
    panel.shown = { kind: "empty", message: NO_MAP_MESSAGE, action: "mapFolder" };
    panel.send();
    return panel;
  }

  private static reveal(extensionUri: vscode.Uri, root: string, file: string, preserveFocus: boolean): ArchitecturePanel {
    const existing = ArchitecturePanel.instance;
    if (existing) {
      existing.panel.reveal(existing.panel.viewColumn, preserveFocus);
      return existing;
    }
    const column = vscode.window.visibleTextEditors.length === 0 ? vscode.ViewColumn.Active : vscode.ViewColumn.Beside;
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, "Architecture", { viewColumn: column, preserveFocus }, { retainContextWhenHidden: false });
    const created = new ArchitecturePanel(panel, extensionUri, root, file);
    ArchitecturePanel.instance = created;
    return created;
  }

  /** The boxes marked as citing the highlighted file, and whether they follow the editor. */
  get highlightState(): { ids: string[]; file: string | null; follow: boolean } {
    if (this.highlightFile === null) return { ids: this.focused, file: null, follow: this.follow };
    const rel = repoRelative(this.root, this.highlightFile);
    return { ids: rel !== null && this.shown.kind === "diagram" ? citingBoxes(this.shown.diagram, rel) : [], file: rel, follow: this.follow };
  }

  /** Marks the boxes citing `file` (absolute), or clears the marks for `null` (UI-03). */
  highlight(file: string | null): void {
    this.highlightFile = file;
    this.focused = [];
    this.sendHighlight();
  }

  /** Marks box `id` alone (UI-06). */
  focusBox(id: string): void {
    this.highlightFile = null;
    this.focused = [id];
    this.sendHighlight();
  }

  /** Switches the open panel to `file` (resolved against `root`) without revealing it. */
  showFile(root: string, file: string): void {
    if (file !== this.file) this.changes = null;
    this.root = root;
    this.file = file;
    this.reload();
  }

  /** Reads the file again and sends it (or an empty state) to the webview. */
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
    const message: HostMessage =
      this.shown.kind === "diagram"
        ? { type: "load", doc: this.shown.doc, file: this.file }
        : { type: "empty", message: this.shown.message, ...(this.shown.action ? { action: this.shown.action } : {}) };
    void this.panel.webview.postMessage(message);
    this.sendHighlight();
    this.sendFreshness();
    this.sendChanges();
  }

  /** Computes the shown map's freshness and sends its badges and header. */
  sendFreshness(): void {
    const service = ArchitecturePanel.freshnessService;
    if (this.shown.kind !== "diagram" || this.file === "" || service === undefined) {
      this.freshness = null;
      ArchitecturePanel.freshnessChanged.fire(0);
      return;
    }
    const state = service.of(this.root, this.file);
    this.freshness = state;
    const changed = changedBoxes(state);
    const header = freshnessHeader(changed, this.shown.diagram.components.length, state.revision, state.createdAt, new Date());
    const message: HostMessage = { type: "freshness", boxes: state.boxes, header };
    void this.panel.webview.postMessage(message);
    ArchitecturePanel.freshnessChanged.fire(changed);
  }

  /** The shown map's components with their citations, for marking changes. */
  components(): { id: string; sources: { path: string; line?: number; end_line?: number }[] }[] {
    return this.shown.kind === "diagram" ? this.shown.diagram.components : [];
  }

  /** Marks the boxes a diff touched, or clears the marks for `null` (FRS-04). */
  showChanges(overlay: ChangeOverlay | null): void {
    this.changes = overlay;
    this.sendChanges();
  }

  get changeOverlay(): ChangeOverlay | null {
    return this.changes;
  }

  private sendChanges(): void {
    const message: HostMessage = { type: "changes", overlay: this.changes };
    void this.panel.webview.postMessage(message);
  }

  /** The shown map's freshness, for the e2e tests. */
  get freshnessState(): MapFreshness | null {
    return this.freshness;
  }

  private sendHighlight(): void {
    const message: HostMessage = { type: "highlight", ...this.highlightState };
    void this.panel.webview.postMessage(message);
  }

  /**
   * Handles a message from the webview (also the e2e test hook's entry point). `openSource`
   * uses the diagram the webview was last sent, resolved against the panel's repo root.
   */
  async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        this.send();
        return;
      case "setFollow": {
        this.follow = message.on;
        const editor = vscode.window.activeTextEditor;
        if (this.follow && editor?.document.uri.scheme === "file") this.highlight(editor.document.uri.fsPath);
        else this.sendHighlight();
        return;
      }
      case "mapFolder":
        await vscode.commands.executeCommand("sustain.mapFolder", vscode.Uri.file(this.root));
        return;
      case "clearChanges":
        this.showChanges(null);
        return;
      case "openSource":
        await this.openBox(message.componentId, message.index);
        return;
    }
  }

  /** Opens source `index` of box `componentId` (FR-NAV-01; Open code in the box menu, UI-05). */
  async openBox(componentId: string, index = 0): Promise<void> {
    if (this.shown.kind !== "diagram") return;
    const component = this.shown.diagram.components.find((candidate) => candidate.id === componentId);
    if (!component) return;
    // A moved citation opens where its lines are now (FRS-03).
    const now = this.freshness?.citations.find((citation) => citation.component === componentId && citation.index === index && citation.state === "moved")?.now;
    if (now) await openSourceRef(this.root, { path: now.path, ...(now.line === undefined ? {} : { line: now.line }), ...(now.end_line === undefined ? {} : { end_line: now.end_line }) }, this.panel.viewColumn);
    else await openSource(this.root, component, index, this.panel.viewColumn);
  }

  private dispose(): void {
    if (ArchitecturePanel.instance === this) {
      ArchitecturePanel.instance = undefined;
      ArchitecturePanel.freshnessChanged.fire(0);
    }
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
