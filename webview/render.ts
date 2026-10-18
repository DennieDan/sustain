// Draws a laid-out Scene as SVG (FR-VIEW-05). Colours, stroke widths and dash patterns come from
// webview/styles.css (VS Code theme variables); this module sets geometry, classes and data
// attributes only. Text sizes are the ones the layout measured node boxes with.
import { LABEL_PX, SUBLABEL_PX, TAG_PX } from "../src/layout/measure";
import type { MeasureText, Point, Scene, SceneEdge } from "../src/layout/scene";
import type { ViewDiagram } from "../src/model/tolerant";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Corner radius of node boxes. */
const NODE_RADIUS = 6;
const BOUNDARY_RADIUS = 8;
/** Boundary label offset from the rectangle's top-left corner. */
const BOUNDARY_LABEL_DX = 10;
const BOUNDARY_LABEL_DY = 16;
const BOUNDARY_LABEL_PX = 12;
const EDGE_LABEL_PX = 11;
/** Arrowhead length along the last segment and half its width. */
const ARROW_LENGTH = 9;
const ARROW_HALF_WIDTH = 4.5;
/** Horizontal padding inside the tag badge on each side of the text. */
const TAG_BADGE_PAD_X = 4;

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, String(value));
  return el;
}

function textEl(className: string, content: string, x: number, y: number, sizePx: number, anchor: "start" | "middle"): SVGTextElement {
  const el = svgEl("text", { class: className, x, y, "font-size": sizePx, "text-anchor": anchor, "dominant-baseline": "central" });
  el.textContent = content;
  return el;
}

/** The edge's line (ending at the arrowhead's base) and its arrowhead triangle. */
function edgeGeometry(points: Point[]): { line: string; head: string } {
  const tip = points[points.length - 1]!;
  // The last point that differs from the tip gives the arrow's direction; repeats of the tip are dropped.
  let end = points.length - 2;
  while (end > 0 && points[end]!.x === tip.x && points[end]!.y === tip.y) end--;
  const from = points[end]!;
  const length = Math.hypot(tip.x - from.x, tip.y - from.y);
  const ux = length > 0 ? (tip.x - from.x) / length : 1;
  const uy = length > 0 ? (tip.y - from.y) / length : 0;
  const base = { x: tip.x - ux * ARROW_LENGTH, y: tip.y - uy * ARROW_LENGTH };
  const linePoints = length > ARROW_LENGTH ? [...points.slice(0, end + 1), base] : points;
  const line = linePoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
  const left = `${base.x - uy * ARROW_HALF_WIDTH} ${base.y + ux * ARROW_HALF_WIDTH}`;
  const right = `${base.x + uy * ARROW_HALF_WIDTH} ${base.y - ux * ARROW_HALF_WIDTH}`;
  return { line, head: `M${tip.x} ${tip.y} L${left} L${right} Z` };
}

function renderEdge(edge: SceneEdge): SVGGElement | undefined {
  if (edge.points.length < 2) return undefined;
  const { line, head } = edgeGeometry(edge.points);
  const g = svgEl("g", { class: `edge edge--${edge.variant}`, "data-index": edge.index, "data-from": edge.from, "data-to": edge.to });
  g.append(svgEl("path", { class: "edge__line", d: line }), svgEl("path", { class: "edge__head", d: head }));
  return g;
}

/**
 * Replaces the children of `content` with the scene, in four layers drawn in this order:
 * `g.boundaries` (outermost first), `g.edges`, `g.edge-labels`, `g.nodes`.
 *
 * - Boundary: `g.boundary.boundary--<kind>[data-index]` > `rect.boundary__box`, `text.boundary__label`.
 * - Edge: `g.edge.edge--<variant>[data-index][data-from][data-to]` > `path.edge__line`, `path.edge__head`.
 * - Edge label: `text.edge-label.edge-label--<variant>[data-index]` at `labelAt` (halo via CSS `paint-order`).
 * - Node: `g.node.node--<type>[data-id][data-index][data-vscode-context]` > `rect.node__box`, `text.node__label`,
 *   optional `text.node__sublabel`, optional `rect.node__tag-badge` + `text.node__tag`. Lines are
 *   stacked with `measure`'s heights and centred vertically and horizontally in the box.
 *
 * `measure` must be the measurer the scene was laid out with.
 */
export function renderScene(content: SVGGElement, diagram: ViewDiagram, scene: Scene, measure: MeasureText): void {
  const boundaries = svgEl("g", { class: "boundaries" });
  for (const boundary of scene.boundaries) {
    const { x, y, w, h } = boundary.rect;
    const g = svgEl("g", { class: `boundary boundary--${boundary.kind}`, "data-index": boundary.index });
    g.append(svgEl("rect", { class: "boundary__box", x, y, width: w, height: h, rx: BOUNDARY_RADIUS }));
    if (boundary.label) {
      g.append(textEl("boundary__label", boundary.label, x + BOUNDARY_LABEL_DX, y + BOUNDARY_LABEL_DY, BOUNDARY_LABEL_PX, "start"));
    }
    boundaries.append(g);
  }

  const edges = svgEl("g", { class: "edges" });
  const edgeLabels = svgEl("g", { class: "edge-labels" });
  for (const edge of scene.edges) {
    const g = renderEdge(edge);
    if (!g) continue;
    edges.append(g);
    if (edge.label && edge.labelAt) {
      const label = textEl(`edge-label edge-label--${edge.variant}`, edge.label, edge.labelAt.x, edge.labelAt.y, EDGE_LABEL_PX, "middle");
      label.setAttribute("data-index", String(edge.index));
      edgeLabels.append(label);
    }
  }

  const nodes = svgEl("g", { class: "nodes" });
  for (const node of scene.nodes) {
    const component = diagram.components[node.index];
    if (!component) continue;
    const { x, y, w, h } = node.rect;
    const g = svgEl("g", { class: `node node--${node.type}`, "data-id": node.id, "data-index": node.index });
    // UI-05: the box's native context menu (Open code), with the browser's own items left out.
    g.setAttribute("data-vscode-context", JSON.stringify({ webviewSection: "box", componentId: node.id, preventDefaultContextMenuItems: true }));
    g.append(svgEl("rect", { class: "node__box", x, y, width: w, height: h, rx: NODE_RADIUS }));
    const lines: { className: string; text: string; sizePx: number; bold: boolean }[] = [
      { className: "node__label", text: component.label, sizePx: LABEL_PX, bold: true },
    ];
    if (component.sublabel) lines.push({ className: "node__sublabel", text: component.sublabel, sizePx: SUBLABEL_PX, bold: false });
    if (component.tag) lines.push({ className: "node__tag", text: component.tag, sizePx: TAG_PX, bold: false });
    const sizes = lines.map((line) => measure(line.text, line.sizePx, line.bold));
    const cx = x + w / 2;
    let top = y + h / 2 - sizes.reduce((sum, size) => sum + size.height, 0) / 2;
    lines.forEach((line, i) => {
      const size = sizes[i]!;
      const cy = top + size.height / 2;
      if (line.className === "node__tag") {
        const badgeW = size.width + 2 * TAG_BADGE_PAD_X;
        g.append(svgEl("rect", { class: "node__tag-badge", x: cx - badgeW / 2, y: top, width: badgeW, height: size.height, rx: size.height / 2 }));
      }
      g.append(textEl(line.className, line.text, cx, cy, line.sizePx, "middle"));
      top += size.height;
    });
    nodes.append(g);
  }

  content.replaceChildren(boundaries, edges, edgeLabels, nodes);
}
