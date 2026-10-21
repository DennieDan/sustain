// Helpers for the webview DOM tests: a fixed-advance measurer and a hand-built Scene, so these
// tests don't depend on the ELK layout.
import type { MeasureText, Point, Rect, Scene } from "../../../src/viewer/layout/scene";
import type { ViewDiagram } from "../../../src/core/tolerant";

/** Every character advances 0.6 em; a line is 1.32 em tall. */
export const fixedMeasure: MeasureText = (text, sizePx) => ({ width: text.length * 0.6 * sizePx, height: 1.32 * sizePx });

const NODE_W = 160;
const NODE_H = 80;

/**
 * Nodes on a 6-column grid, straight centre-to-centre edges (self-loops as a small rectangle on
 * the right), label anchors at the edge midpoint, boundaries as 16 px padded member bounds.
 */
export function gridScene(diagram: ViewDiagram): Scene {
  const rects: Record<string, Rect> = {};
  const nodes = diagram.components.map((component, index) => {
    const rect = { x: (index % 6) * 220, y: Math.floor(index / 6) * 140, w: NODE_W, h: NODE_H };
    rects[component.id] = rect;
    return { id: component.id, index, type: component.type, rect };
  });
  const edges = diagram.connections.map((connection, index) => {
    const a = rects[connection.from]!;
    const b = rects[connection.to]!;
    const points: Point[] =
      connection.from === connection.to
        ? [
            { x: a.x + a.w, y: a.y + 20 },
            { x: a.x + a.w + 20, y: a.y + 20 },
            { x: a.x + a.w + 20, y: a.y + 40 },
            { x: a.x + a.w, y: a.y + 40 },
          ]
        : [
            { x: a.x + a.w / 2, y: a.y + a.h / 2 },
            { x: b.x + b.w / 2, y: b.y + b.h / 2 },
          ];
    const edge: Scene["edges"][number] = { index, from: connection.from, to: connection.to, variant: connection.variant, points };
    if (connection.label) {
      edge.label = connection.label;
      edge.labelAt = { x: (points[0]!.x + points[1]!.x) / 2, y: (points[0]!.y + points[1]!.y) / 2 };
    }
    return edge;
  });
  const boundaries = diagram.boundaries.map((boundary, index) => {
    const members = boundary.wraps.map((id) => rects[id]!);
    const x = Math.min(...members.map((r) => r.x)) - 16;
    const y = Math.min(...members.map((r) => r.y)) - 16;
    const right = Math.max(...members.map((r) => r.x + r.w)) + 16;
    const bottom = Math.max(...members.map((r) => r.y + r.h)) + 16;
    return { index, kind: boundary.kind, label: boundary.label, rect: { x, y, w: right - x, h: bottom - y }, nested: false };
  });
  const all = [...nodes.map((n) => n.rect), ...boundaries.map((b) => b.rect)];
  const left = Math.min(...all.map((r) => r.x)) - 20;
  const top = Math.min(...all.map((r) => r.y)) - 20;
  const right = Math.max(...all.map((r) => r.x + r.w)) + 20;
  const bottom = Math.max(...all.map((r) => r.y + r.h)) + 20;
  return { mode: "authored", nodes, boundaries, edges, bounds: { x: left, y: top, w: right - left, h: bottom - top } };
}

/** A fresh `<svg><g/></svg>` attached to the document; returns the content group. */
export function contentGroup(): SVGGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.append(g);
  document.body.replaceChildren(svg);
  return g;
}
