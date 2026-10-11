// Webview entry point (FR-VIEW-04..07): builds the DOM, talks to the extension host, lays out,
// renders and fits each loaded diagram. Bundled as dist/webview.js; the host's HTML only links
// dist/webview.css and this script.
import { layoutDiagram } from "../src/layout/layout";
import type { MeasureText } from "../src/layout/scene";
import type { HostMessage, WebviewMessage } from "../src/model/messages";
import { readDiagram } from "../src/model/tolerant";
import { renderScene } from "./render";
import { TooltipController } from "./tooltip";
import { ViewportController } from "./viewport";

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

const SVG_NS = "http://www.w3.org/2000/svg";
/** Line height of measured text, as a multiple of the font size. */
const LINE_HEIGHT = 1.32;
/** Toolbar buttons: `data-action`, text, accessible name. */
const TOOLBAR: [action: string, text: string, title: string][] = [
  ["fit", "Fit", "Fit to view (F)"],
  ["zoom-out", "\u2212", "Zoom out (-)"],
  ["zoom-in", "+", "Zoom in (+)"],
  ["reset", "100\u00a0%", "Zoom to 100 % (0)"],
];

const vscode = acquireVsCodeApi();

// body > div.app > svg.canvas > g.viewport; div.toolbar > button[data-action]×4;
// div.empty-state[hidden]; div.tooltip[hidden]
const app = document.createElement("div");
app.className = "app app--empty";
const svg = document.createElementNS(SVG_NS, "svg");
svg.setAttribute("class", "canvas");
const content = document.createElementNS(SVG_NS, "g");
content.setAttribute("class", "viewport");
svg.append(content);
const toolbar = document.createElement("div");
toolbar.className = "toolbar";
toolbar.setAttribute("role", "toolbar");
for (const [action, text, title] of TOOLBAR) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "toolbar__button";
  button.setAttribute("data-action", action);
  button.title = title;
  button.setAttribute("aria-label", title);
  button.textContent = text;
  toolbar.append(button);
}
const emptyState = document.createElement("div");
emptyState.className = "empty-state";
emptyState.hidden = true;
const tooltipElement = document.createElement("div");
tooltipElement.className = "tooltip";
tooltipElement.setAttribute("role", "tooltip");
tooltipElement.hidden = true;
app.append(svg, toolbar, emptyState, tooltipElement);
document.body.append(app);

const viewport = new ViewportController(svg, content, toolbar, window);
const tooltip = new TooltipController(svg, tooltipElement, (message) => vscode.postMessage(message));
viewport.onChange = () => tooltip.hide();

const canvasContext = document.createElement("canvas").getContext("2d");

/** File of the diagram on screen; a reload of the same file keeps the viewport (FR-VIEW-06). */
let shownFile: string | undefined;
/** Incremented per host message so a slower, older layout never replaces a newer state. */
let generation = 0;

function showEmpty(message: string): void {
  content.replaceChildren();
  tooltip.setDiagram(undefined);
  viewport.bounds = undefined;
  shownFile = undefined;
  emptyState.textContent = message;
  emptyState.hidden = false;
  app.classList.add("app--empty");
}

async function load(doc: unknown, file: string, current: number): Promise<void> {
  const result = readDiagram(doc);
  if (!result.ok) {
    showEmpty(`Can't show \`${file}\`: ${result.reason}`);
    return;
  }
  if (!canvasContext) throw new Error("the webview has no 2D canvas context to measure text with");
  const family = getComputedStyle(document.body).getPropertyValue("--vscode-font-family").trim() || "sans-serif";
  const measure: MeasureText = (text, sizePx, bold) => {
    canvasContext.font = `${bold ? "bold " : ""}${sizePx}px ${family}`;
    return { width: canvasContext.measureText(text).width, height: sizePx * LINE_HEIGHT };
  };
  // The canvas must be displayed for its size to be the panel size.
  emptyState.hidden = true;
  app.classList.remove("app--empty");
  const scene = await layoutDiagram(result.diagram, { measure, viewport: viewport.size() });
  if (current !== generation) return;
  renderScene(content, result.diagram, scene, measure);
  tooltip.setDiagram(result.diagram);
  viewport.bounds = scene.bounds;
  if (file !== shownFile) viewport.fit();
  shownFile = file;
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  const current = ++generation;
  if (message.type === "empty") {
    showEmpty(message.message);
    return;
  }
  load(message.doc, message.file, current).catch((error: unknown) => {
    if (current === generation) showEmpty(`Can't show \`${message.file}\`: ${error instanceof Error ? error.message : String(error)}`);
  });
});

vscode.postMessage({ type: "ready" });
