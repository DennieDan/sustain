// The architecture WebviewPanel (FR-VIEW-04, ADR 0011): one per window, showing one file.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, isAbsolute, relative, sep } from "node:path";
import * as vscode from "vscode";
import { citingBoxes } from "../model/citing";
import type { HostMessage, WebviewMessage } from "../model/messages";
import { parseDiagram, type ViewDiagram } from "../model/tolerant";
import { webviewHtml } from "./html";
import { openSource } from "./navigate";

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

  private shown: Shown = { kind: "empty", message: "" };
  /** The file whose citing boxes are marked (UI-03), absolute, or `null`. */
  private highlightFile: string | null = null;
  /** Follow editor: the marks move with the active editor. */
  private follow = false;
  /** A box marked on its own, from an Ask answer (UI-06). */
  private focused: string[] = [];
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
      case "openSource":
        await this.openBox(message.componentId, message.index);
        return;
    }
  }

  /** Opens source `index` of box `componentId` (FR-NAV-01; Open code in the box menu, UI-05). */
  async openBox(componentId: string, index = 0): Promise<void> {
    if (this.shown.kind !== "diagram") return;
    const component = this.shown.diagram.components.find((candidate) => candidate.id === componentId);
    if (component) await openSource(this.root, component, index, this.panel.viewColumn);
  }

  private dispose(): void {
    if (ArchitecturePanel.instance === this) ArchitecturePanel.instance = undefined;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
