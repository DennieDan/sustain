// The architecture WebviewPanel (FR-VIEW-04, ADR 0011): one per window, showing one file.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, relative, sep } from "node:path";
import * as vscode from "vscode";
import type { HostMessage, WebviewMessage } from "../model/messages";
import { parseDiagram, type ViewDiagram } from "../model/tolerant";
import { webviewHtml } from "./html";
import { openSource } from "./navigate";

export const VIEW_TYPE = "sustain.architecture";

/** What the panel currently shows: a diagram, or an empty state with a message. */
type Shown = { kind: "diagram"; doc: unknown; diagram: ViewDiagram } | { kind: "empty"; message: string };

/** How a file is named in messages: repo-relative when inside the root, else the base name. */
function displayName(root: string, file: string): string {
  const rel = relative(root, file);
  return rel.startsWith("..") || rel === "" ? basename(file) : rel.split(sep).join("/");
}

export class ArchitecturePanel {
  private static instance: ArchitecturePanel | undefined;

  private shown: Shown = { kind: "empty", message: "" };
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
      this.shown.kind === "diagram" ? { type: "load", doc: this.shown.doc, file: this.file } : { type: "empty", message: this.shown.message };
    void this.panel.webview.postMessage(message);
  }

  /**
   * Handles a message from the webview (also the e2e test hook's entry point). `openSource`
   * uses the diagram the webview was last sent, resolved against the panel's repo root.
   */
  async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === "ready") {
      this.send();
      return;
    }
    if (this.shown.kind !== "diagram") return;
    const component = this.shown.diagram.components.find((candidate) => candidate.id === message.componentId);
    if (component) await openSource(this.root, component, message.index, this.panel.viewColumn);
  }

  private dispose(): void {
    if (ArchitecturePanel.instance === this) ArchitecturePanel.instance = undefined;
    for (const disposable of this.disposables.splice(0)) disposable.dispose();
  }
}
