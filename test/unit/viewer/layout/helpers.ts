import { runInThread } from "../../../../src/viewer/layout/elkInThread";
import { layoutDiagram } from "../../../../src/viewer/layout/layout";
import type { MeasureText, Point, Rect, Scene } from "../../../../src/viewer/layout/scene";
import { readDiagram } from "../../../../src/core/tolerant";
import type { ViewDiagram } from "../../../../src/core/tolerant";

/** JetBrains Mono metrics: 0.6 em advance per character, 1.32 em line height. */
export const fixedAdvance: MeasureText = (text, sizePx) => ({ width: [...text].length * 0.6 * sizePx, height: 1.32 * sizePx });

export const VIEWPORT = { width: 1600, height: 1000 };

/** A diagram from a partial Archify document; fails the test if the tolerant reader rejects it. */
export function diagramOf(doc: Record<string, unknown>): ViewDiagram {
  const result = readDiagram({ schema_version: 1, diagram_type: "architecture", meta: { title: "t" }, ...doc });
  if (!result.ok) throw new Error(result.reason);
  return result.diagram;
}

export function lay(diagram: ViewDiagram, viewport = VIEWPORT): Promise<Scene> {
  return layoutDiagram(diagram, { measure: fixedAdvance, viewport, run: runInThread });
}

export function comp(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, type: "backend", label: id.toUpperCase(), ...extra };
}

/** Connections a→b→c… along `ids`. */
export function chain(ids: readonly string[]): { from: string; to: string }[] {
  return ids.slice(1).map((to, i) => ({ from: ids[i]!, to }));
}

export function rectOf(scene: Scene, id: string): Rect {
  const node = scene.nodes.find((n) => n.id === id);
  if (!node) throw new Error(`no node ${id}`);
  return node.rect;
}

const EPS = 1e-6;

/** `outer` contains `inner` (edges may touch). */
export function contains(outer: Rect, inner: Rect): boolean {
  return outer.x <= inner.x + EPS && outer.y <= inner.y + EPS && inner.x + inner.w <= outer.x + outer.w + EPS && inner.y + inner.h <= outer.y + outer.h + EPS;
}

/** Interiors intersect (touching edges do not count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;
}

/** `p` lies on the border of `r`. */
export function onBorder(r: Rect, p: Point): boolean {
  const inX = p.x >= r.x - EPS && p.x <= r.x + r.w + EPS;
  const inY = p.y >= r.y - EPS && p.y <= r.y + r.h + EPS;
  const onVertical = Math.abs(p.x - r.x) < EPS || Math.abs(p.x - r.x - r.w) < EPS;
  const onHorizontal = Math.abs(p.y - r.y) < EPS || Math.abs(p.y - r.y - r.h) < EPS;
  return inX && inY && (onVertical || onHorizontal);
}
