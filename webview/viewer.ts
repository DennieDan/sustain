// The map viewer (FR-VIEW-04..07): builds the DOM, lays out, renders and fits each loaded
// diagram. It talks to whatever hosts it only through the bridge (VWR-01), so the VS Code
// webview, the diagram page and the cloud site share it.
import { layoutDiagram } from "../src/layout/layout";
import type { MeasureText } from "../src/layout/scene";
import type { ChangeOverlay, Ghost, GhostArrow, HostMessage } from "../src/model/messages";
import { NO_IMPORT_EVIDENCE } from "../src/model/uncertainty";
import type { Freshness } from "../src/model/staleness";
import { readDiagram, type ViewDiagram } from "../src/model/tolerant";
import { onMessage, post } from "./bridge";
import { NodeClicks } from "./click";
import { renderScene } from "./render";
import { TooltipController } from "./tooltip";
import { ViewportController } from "./viewport";

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

/** Ghost ids hold a colon, which no map id may, so a ghost never shares an id with a box. */
const GHOST_PREFIX = "ghost:";

/**
 * `diagram` with each new box candidate added as an unconnected, uncited box (PRC-02), and each new
 * arrow candidate between two of its boxes as a dashed arrow after its own arrows (PRC-06).
 */
export function withGhosts(diagram: ViewDiagram, ghosts: readonly Ghost[], arrows: readonly GhostArrow[] = []): ViewDiagram {
  const ids = new Set(diagram.components.map((component) => component.id));
  const newArrows = arrows.filter((arrow) => ids.has(arrow.from) && ids.has(arrow.to)).map((arrow) => ({ from: arrow.from, to: arrow.to, label: "new import", variant: "dashed" as const }));
  if (ghosts.length === 0 && newArrows.length === 0) return diagram;
  const extra = ghosts.map((ghost, index) => ({
    id: `${GHOST_PREFIX}${index}`,
    type: "external" as const,
    label: ghost.label,
    sublabel: `${ghost.files} new file${ghost.files === 1 ? "" : "s"}`,
    sources: [],
  }));
  return { ...diagram, components: [...diagram.components, ...extra], connections: [...diagram.connections, ...newArrows] };
}

/** `diagram` with each arrow in `edges` dashed and labelled as having no import evidence (ACC-03). */
export function withUncertainty(diagram: ViewDiagram, edges: readonly number[]): ViewDiagram {
  if (edges.length === 0) return diagram;
  const marked = new Set(edges);
  return {
    ...diagram,
    connections: diagram.connections.map((connection, index) =>
      marked.has(index) ? { ...connection, variant: "dashed" as const, label: connection.label ? `${connection.label} · ${NO_IMPORT_EVIDENCE}` : NO_IMPORT_EVIDENCE } : connection,
    ),
  };
}

/** Builds the viewer in `mount` (the page's body by default) and starts listening to the host. */
export function startViewer(mount: HTMLElement = document.body): void {
  // body > div.app > svg.canvas > g.viewport; div.toolbar > button[data-action]×4;
  // div.highlight[hidden] > span.highlight__text, button.highlight__follow; div.freshness[hidden];
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
  // UI-03: which boxes cite the active file, and the Follow editor toggle.
  const highlightBar = document.createElement("div");
  highlightBar.className = "highlight";
  highlightBar.hidden = true;
  const highlightText = document.createElement("span");
  highlightText.className = "highlight__text";
  const followButton = document.createElement("button");
  followButton.type = "button";
  followButton.className = "toolbar__button highlight__follow";
  followButton.textContent = "Follow editor";
  followButton.title = "Keep the highlight in step with the active editor";
  followButton.setAttribute("aria-pressed", "false");
  highlightBar.append(highlightText, followButton);
  // FRS-03: how many boxes changed since the map was made.
  const freshnessBar = document.createElement("div");
  freshnessBar.className = "freshness";
  freshnessBar.hidden = true;
  // FRS-04: the change overlay's summary, the files it could not place, and Clear.
  const changesBar = document.createElement("div");
  changesBar.className = "changes";
  changesBar.hidden = true;
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";
  emptyState.hidden = true;
  const tooltipElement = document.createElement("div");
  tooltipElement.className = "tooltip";
  tooltipElement.setAttribute("role", "tooltip");
  tooltipElement.hidden = true;
  // ACC-03: what the dotted boxes and grey dashed arrows mean.
  const legend = document.createElement("div");
  legend.className = "checks-legend";
  legend.hidden = true;
  for (const [className, text] of [
    ["checks-legend__box", "Dotted box: its evidence is in doubt. Hover it for the reason."],
    ["checks-legend__edge", "Grey dashed arrow: no import path backs it."],
  ]) {
    const row = document.createElement("div");
    row.className = `checks-legend__row ${className}`;
    row.textContent = text!;
    legend.append(row);
  }
  app.append(svg, toolbar, highlightBar, freshnessBar, changesBar, emptyState, tooltipElement, legend);
  mount.append(app);

  const viewport = new ViewportController(svg, content, toolbar, window);
  const tooltip = new TooltipController(svg, tooltipElement, (message) => post(message));
  new NodeClicks(svg, (message) => post(message));
  viewport.onChange = () => tooltip.hide();

  const canvasContext = document.createElement("canvas").getContext("2d");

  /** File of the diagram on screen; a reload of the same file keeps the viewport (FR-VIEW-06). */
  let shownFile: string | undefined;
  /** The last loaded document, so ghosts can be drawn into it again. */
  let lastLoad: { doc: unknown; file: string } | null = null;
  let ghosts: Ghost[] = [];
  let ghostArrows: GhostArrow[] = [];
  /** Connections from this index on are ghost arrows. */
  let firstGhostArrow = Number.POSITIVE_INFINITY;

  /** Ghost boxes are dashed and have no box menu. */
  function applyGhosts(): void {
    for (const node of content.querySelectorAll(".node")) {
      if (!(node.getAttribute("data-id") ?? "").startsWith(GHOST_PREFIX)) continue;
      node.classList.add("node--ghost");
      node.setAttribute("data-vscode-context", JSON.stringify({ webviewSection: "ghost", preventDefaultContextMenuItems: true }));
    }
    for (const edge of content.querySelectorAll(".edge, .edge-label")) {
      edge.classList.toggle("edge--ghost", Number(edge.getAttribute("data-index")) >= firstGhostArrow);
    }
  }
  /** The boxes marked as citing the active file, kept across reloads (UI-03). */
  let highlight: { ids: string[]; file: string | null; follow: boolean } = { ids: [], file: null, follow: false };

  followButton.addEventListener("click", () => post({ type: "setFollow", on: !highlight.follow }));
  /** ACC-03: doubtful boxes and unbacked arrows, and whether the Checks toggle shows them. */
  let uncertain: { boxes: Record<string, string>; edges: number[]; shown: boolean } = { boxes: {}, edges: [], shown: true };

  function applyUncertainty(): void {
    const boxes = uncertain.shown ? uncertain.boxes : {};
    const edges = new Set(uncertain.shown ? uncertain.edges : []);
    for (const node of content.querySelectorAll(".node")) node.classList.toggle("node--doubtful", (node.getAttribute("data-id") ?? "") in boxes);
    for (const edge of content.querySelectorAll(".edge, .edge-label")) edge.classList.toggle("edge--unsupported", edges.has(Number(edge.getAttribute("data-index"))));
    tooltip.setNotes(boxes);
    legend.hidden = Object.keys(boxes).length === 0 && edges.size === 0;
    legend.querySelector(".checks-legend__box")!.toggleAttribute("hidden", Object.keys(boxes).length === 0);
    legend.querySelector(".checks-legend__edge")!.toggleAttribute("hidden", edges.size === 0);
  }

  /** Each box's state against the code, kept across reloads (FRS-03). */
  let freshness: Record<string, Freshness> = {};

  const BADGES: Partial<Record<Freshness, string>> = { edited: "changed", missing: "missing" };
  let changes: ChangeOverlay | null = null;

  function applyChanges(): void {
    const strong = new Set(changes?.strong ?? []);
    const weak = new Set(changes?.weak ?? []);
    for (const node of content.querySelectorAll(".node")) {
      const id = node.getAttribute("data-id") ?? "";
      node.classList.toggle("node--change-strong", strong.has(id));
      node.classList.toggle("node--change-weak", weak.has(id));
    }
    changesBar.replaceChildren();
    changesBar.hidden = changes === null;
    if (changes === null) return;
    const summary = document.createElement("div");
    summary.className = "changes__summary";
    const near = changes.weak.length > 0 ? `, ${changes.weak.length} more in the same files` : "";
    summary.textContent = `${changes.scope}: ${changes.strong.length} box${changes.strong.length === 1 ? "" : "es"} touched${near}`;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "toolbar__button changes__clear";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => post({ type: "clearChanges" }));
    summary.append(clear);
    changesBar.append(summary);
    if (changes.uncovered.length > 0) {
      const details = document.createElement("details");
      details.className = "changes__uncovered";
      const title = document.createElement("summary");
      title.textContent = `Not on the map: ${changes.uncovered.length} file${changes.uncovered.length === 1 ? "" : "s"}`;
      const list = document.createElement("ul");
      for (const path of changes.uncovered) {
        const item = document.createElement("li");
        item.textContent = path;
        list.append(item);
      }
      details.append(title, list);
      changesBar.append(details);
    }
  }

  function applyFreshness(): void {
    for (const node of content.querySelectorAll<SVGGElement>(".node")) {
      node.querySelector(".node__badge")?.remove();
      node.classList.remove("node--edited", "node--missing");
      const state = freshness[node.getAttribute("data-id") ?? ""];
      const badge = state === undefined ? undefined : BADGES[state];
      const box = node.querySelector(".node__box");
      if (badge === undefined || box === null) continue;
      node.classList.add(`node--${state}`);
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("class", "node__badge");
      text.setAttribute("x", String(Number(box.getAttribute("x")) + Number(box.getAttribute("width")) - 6));
      text.setAttribute("y", String(Number(box.getAttribute("y")) + 10));
      text.setAttribute("text-anchor", "end");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("font-size", "10");
      text.textContent = badge;
      node.append(text);
    }
  }

  function applyHighlight(): void {
    const marked = new Set(highlight.ids);
    for (const node of content.querySelectorAll(".node")) node.classList.toggle("node--highlight", marked.has(node.getAttribute("data-id") ?? ""));
    app.classList.toggle("app--highlighting", marked.size > 0);
    followButton.setAttribute("aria-pressed", String(highlight.follow));
    followButton.classList.toggle("highlight__follow--on", highlight.follow);
    highlightBar.hidden = highlight.file === null && !highlight.follow;
    const name = highlight.file?.split("/").pop() ?? "";
    highlightText.textContent =
      highlight.file === null ? "" : marked.size === 0 ? `No box cites ${name}` : `${marked.size} box${marked.size === 1 ? " cites" : "es cite"} ${name}`;
  }
  /** Incremented per host message so a slower, older layout never replaces a newer state. */
  let generation = 0;

  function showEmpty(message: string, action?: "mapFolder"): void {
    content.replaceChildren();
    tooltip.setDiagram(undefined);
    viewport.bounds = undefined;
    shownFile = undefined;
    emptyState.replaceChildren(document.createTextNode(message));
    if (action === "mapFolder") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "empty-state__action";
      button.textContent = "Map this folder";
      button.addEventListener("click", () => post({ type: "mapFolder" }));
      emptyState.append(button);
    }
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
    const family = getComputedStyle(document.body).getPropertyValue("--sustain-font-family").trim() || "sans-serif";
    const measure: MeasureText = (text, sizePx, bold) => {
      canvasContext.font = `${bold ? "bold " : ""}${sizePx}px ${family}`;
      return { width: canvasContext.measureText(text).width, height: sizePx * LINE_HEIGHT };
    };
    // The canvas must be displayed for its size to be the panel size.
    emptyState.hidden = true;
    app.classList.remove("app--empty");
    firstGhostArrow = result.diagram.connections.length;
    const diagram = withGhosts(withUncertainty(result.diagram, uncertain.shown ? uncertain.edges : []), ghosts, ghostArrows);
    const scene = await layoutDiagram(diagram, { measure, viewport: viewport.size() });
    if (current !== generation) return;
    renderScene(content, diagram, scene, measure);
    applyGhosts();
    applyUncertainty();
    applyHighlight();
    applyFreshness();
    applyChanges();
    tooltip.setDiagram(diagram);
    viewport.bounds = scene.bounds;
    if (file !== shownFile) viewport.fit();
    shownFile = file;
  }

  onMessage((message: HostMessage) => {
    if (message.type === "highlight") {
      highlight = { ids: message.ids, file: message.file, follow: message.follow };
      applyHighlight();
      return;
    }
    if (message.type === "changes") {
      changes = message.overlay;
      applyChanges();
      return;
    }
    if (message.type === "freshness") {
      freshness = message.boxes;
      freshnessBar.replaceChildren();
      if (message.header !== null) {
        const refresh = document.createElement("button");
        refresh.type = "button";
        refresh.className = "toolbar__button freshness__refresh";
        refresh.textContent = "Refresh";
        refresh.addEventListener("click", () => post({ type: "refresh" }));
        freshnessBar.append(document.createTextNode(`${message.header} · `), refresh);
      }
      freshnessBar.hidden = message.header === null;
      applyFreshness();
      return;
    }
    if (message.type === "ghosts") {
      ghosts = message.ghosts;
      ghostArrows = message.arrows ?? [];
      if (lastLoad === null) return;
    }
    if (message.type === "uncertainty") {
      const relabel = JSON.stringify(uncertain.shown ? uncertain.edges : []) !== JSON.stringify(message.shown ? message.edges : []);
      uncertain = { boxes: message.boxes, edges: message.edges, shown: message.shown };
      // Arrow labels change the layout, so only a change to them draws the map again.
      if (!relabel || lastLoad === null) {
        applyUncertainty();
        return;
      }
    }
    const current = ++generation;
    if (message.type === "empty") {
      lastLoad = null;
      showEmpty(message.message, message.action);
      return;
    }
    if (message.type === "load") lastLoad = { doc: message.doc, file: message.file };
    const { doc, file } = lastLoad!;
    load(doc, file, current).catch((error: unknown) => {
      if (current === generation) showEmpty(`Can't show \`${file}\`: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  post({ type: "ready" });
}
