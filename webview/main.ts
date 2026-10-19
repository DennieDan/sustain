// Webview entry point (FR-VIEW-04..07, FR-CMP-09..12): builds the DOM, talks to the extension
// host, lays out, renders and fits each loaded diagram, and shows its comparison with the
// baseline (header, marks, changes panel). Bundled as dist/webview.js; the host's HTML only links
// dist/webview.css and this script.
import { layoutDiagram } from "../src/layout/layout";
import type { MeasureText } from "../src/layout/scene";
import type { Compare, HostMessage, WebviewMessage } from "../src/model/messages";
import { readDiagram } from "../src/model/tolerant";
import { ChangesView, compareDiagrams, readChangesState } from "./changes";
import type { ChangesState, Comparison } from "./changes";
import { NodeClicks } from "./click";
import { applyMarks, elementBox, renderScene } from "./render";
import { TooltipController } from "./tooltip";
import { ViewportController } from "./viewport";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewMessage): void;
  getState(): unknown;
  setState(state: ChangesState): void;
};

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
const post = (message: WebviewMessage): void => vscode.postMessage(message);

// body > div.app > div.header, div.stage; div.stage > svg.canvas > g.viewport;
// div.toolbar > button[data-action]×4; aside.changes[hidden]; div.empty-state[hidden];
// div.tooltip[hidden]
const app = document.createElement("div");
app.className = "app app--empty";
const header = document.createElement("div");
header.className = "header";
const stage = document.createElement("div");
stage.className = "stage";
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
const panel = document.createElement("aside");
panel.className = "changes";
panel.setAttribute("aria-label", "Changes");
panel.hidden = true;
const emptyState = document.createElement("div");
emptyState.className = "empty-state";
emptyState.hidden = true;
const tooltipElement = document.createElement("div");
tooltipElement.className = "tooltip";
tooltipElement.setAttribute("role", "tooltip");
tooltipElement.hidden = true;
stage.append(svg, toolbar, panel, emptyState);
app.append(header, stage, tooltipElement);
document.body.append(app);

const viewport = new ViewportController(svg, content, toolbar, window);
const tooltip = new TooltipController(svg, tooltipElement, post);
new NodeClicks(svg, post);
viewport.onChange = () => tooltip.hide();

/** The rendered scene's comparison and the measurer it was drawn with; `undefined` while nothing is drawn. */
let drawn: { comparison: Comparison | null; measure: MeasureText } | undefined;

/** Applies the drawn comparison's marks and tooltip lines, or removes them when the toggle is off. */
function showMarks(): void {
  if (!drawn) return;
  const marked = changes.state.marks ? drawn.comparison : null;
  applyMarks(content, marked?.diff, drawn.measure);
  const touched = marked?.compare.context.keptAvailable ? marked.compare.changes?.touchedComponents : undefined;
  tooltip.setChanges(marked ? { statuses: marked.diff.components, files: touched && new Map(touched.map((c) => [c.id, c.files])) } : undefined);
}

/** Keeps fits clear of the changes panel while it is expanded (FR-CMP-11). */
function syncInset(): void {
  const covered = !panel.hidden && !changes.state.collapsed;
  viewport.rightInset = covered ? Math.max(0, stage.getBoundingClientRect().right - panel.getBoundingClientRect().left) : 0;
}

const changes = new ChangesView(
  header,
  panel,
  {
    post,
    focus: (kind, index) => {
      const box = elementBox(content, kind, index);
      syncInset();
      if (box) viewport.fitRect(box);
    },
    stateChanged: (state) => {
      vscode.setState(state);
      showMarks();
      syncInset();
    },
  },
  readChangesState(vscode.getState()),
);

const canvasContext = document.createElement("canvas").getContext("2d");

/** File of the diagram on screen; a reload of the same file keeps the viewport (FR-VIEW-06). */
let shownFile: string | undefined;
/** Incremented per host message so a slower, older layout never replaces a newer state. */
let generation = 0;

function showEmpty(message: string): void {
  content.replaceChildren();
  drawn = undefined;
  changes.clear();
  tooltip.setChanges(undefined);
  tooltip.setDiagram(undefined);
  viewport.bounds = undefined;
  shownFile = undefined;
  emptyState.textContent = message;
  emptyState.hidden = false;
  app.classList.add("app--empty");
}

async function load(doc: unknown, file: string, compare: Compare | null, current: number): Promise<void> {
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
  // An unreadable baseline counts as no comparison (FR-CMP-05).
  const comparison = compareDiagrams(result.diagram, compare);
  // The canvas must be displayed, below the header, for its size to be the stage size.
  emptyState.hidden = true;
  app.classList.remove("app--empty");
  changes.show(result.diagram, comparison);
  const scene = await layoutDiagram(result.diagram, { measure, viewport: viewport.size() });
  if (current !== generation) return;
  renderScene(content, result.diagram, scene, measure);
  tooltip.setDiagram(result.diagram);
  drawn = { comparison, measure };
  showMarks();
  viewport.bounds = scene.bounds;
  if (file !== shownFile) {
    syncInset();
    viewport.fit();
  }
  shownFile = file;
}

window.addEventListener("message", (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  const current = ++generation;
  if (message.type === "empty") {
    showEmpty(message.message);
    return;
  }
  load(message.doc, message.file, message.compare, current).catch((error: unknown) => {
    if (current === generation) showEmpty(`Can't show \`${message.file}\`: ${error instanceof Error ? error.message : String(error)}`);
  });
});

vscode.postMessage({ type: "ready" });
