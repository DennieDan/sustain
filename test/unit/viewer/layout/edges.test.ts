// FR-LAY-04 edges and FR-LAY-02 direction choice.
import { describe, expect, test } from "vitest";
import type { Point, Scene } from "../../../../src/viewer/layout/scene";
import { chain, comp, diagramOf, lay, onBorder, rectOf } from "./helpers";

const fit = (scene: Scene, viewport: { width: number; height: number }) => Math.min(viewport.width / scene.bounds.w, viewport.height / scene.bounds.h);

function longestSegmentMidpoints(points: readonly Point[]): Point[] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y));
  const max = Math.max(...lengths);
  return lengths.flatMap((l, i) => (l === max ? [{ x: (points[i]!.x + points[i + 1]!.x) / 2, y: (points[i]!.y + points[i + 1]!.y) / 2 }] : []));
}

describe("FR-LAY-04 authored edges", () => {
  test("a straight segment between the centres, clipped to both borders", async () => {
    const scene = await lay(
      diagramOf({
        components: [comp("a", { pos: [0, 0], size: [100, 50] }), comp("b", { pos: [300, 200], size: [100, 50] })],
        connections: [{ from: "a", to: "b", label: "calls", fromSide: "right", via: [[0, 0]] }],
      }),
    );
    const [edge] = scene.edges;
    // Centres (50,25) → (350,225); the line leaves a through its bottom border.
    expect(edge!.points).toEqual([
      { x: 87.5, y: 50 },
      { x: 312.5, y: 200 },
    ]);
    expect(onBorder(rectOf(scene, "a"), edge!.points[0]!)).toBe(true);
    expect(onBorder(rectOf(scene, "b"), edge!.points[1]!)).toBe(true);
    expect(edge!.label).toBe("calls");
    expect(edge!.labelAt).toEqual({ x: 200, y: 125 });
  });

  test("horizontal neighbours connect right border to left border", async () => {
    const scene = await lay(diagramOf({ components: [comp("a", { pos: [0, 0] }), comp("b", { pos: [300, 0] })], connections: [{ from: "b", to: "a" }] }));
    expect(scene.edges[0]!.points).toEqual([
      { x: 300, y: 30 },
      { x: 120, y: 30 },
    ]);
    expect(scene.edges[0]!.labelAt).toBeUndefined();
    expect(scene.edges[0]!.label).toBeUndefined();
  });

  test("a self-loop is a small rectangle off the node's right side", async () => {
    const scene = await lay(diagramOf({ components: [comp("a", { pos: [0, 0] })], connections: [{ from: "a", to: "a", label: "retry", variant: "dashed" }] }));
    const [edge] = scene.edges;
    expect(edge!.variant).toBe("dashed");
    expect(edge!.points).toEqual([
      { x: 120, y: 20 },
      { x: 136, y: 20 },
      { x: 136, y: 40 },
      { x: 120, y: 40 },
    ]);
    expect(edge!.labelAt).toEqual({ x: 136, y: 30 });
  });
});

describe("FR-LAY-04 auto edges", () => {
  test("orthogonal ELK routes run border to border; labels sit on the longest segment", async () => {
    const scene = await lay(
      diagramOf({
        components: ["a", "b", "c", "d"].map((id) => comp(id)),
        connections: [
          { from: "a", to: "b", label: "one" },
          { from: "a", to: "c", label: "two" },
          { from: "b", to: "d", label: "three" },
          { from: "c", to: "d" },
          { from: "d", to: "d", label: "self" },
        ],
      }),
    );
    expect(scene.mode).toBe("auto");
    for (const edge of scene.edges.slice(0, 4)) {
      expect(onBorder(rectOf(scene, edge.from), edge.points[0]!)).toBe(true);
      expect(onBorder(rectOf(scene, edge.to), edge.points.at(-1)!)).toBe(true);
      if (edge.label) expect(longestSegmentMidpoints(edge.points)).toContainEqual(edge.labelAt);
      else expect(edge.labelAt).toBeUndefined();
    }
    // At least one route bends, so the longest-segment rule is exercised beyond two points.
    expect(scene.edges.some((e) => e.points.length > 2)).toBe(true);
    const d = rectOf(scene, "d");
    expect(scene.edges[4]!.points[0]).toEqual({ x: d.x + d.w, y: d.y + d.h / 2 - 10 });
    expect(scene.edges[4]!.labelAt).toEqual({ x: d.x + d.w + 16, y: d.y + d.h / 2 });
  });
});

describe("FR-LAY-02 direction choice", () => {
  const viewport = { width: 1600, height: 1000 };

  test("a long chain of small boxes fits better left to right", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const scene = await lay(diagramOf({ components: ids.map((id) => comp(id)), connections: chain(ids) }), viewport);
    expect(scene.direction).toBe("RIGHT");
    // The chain runs along x.
    const xs = ids.map((id) => rectOf(scene, id).x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(ids.map((id) => rectOf(scene, id).y)).size).toBe(1);
    // About 0.70 against about 0.60 for DOWN (10·60 + 9·110 + 80 tall).
    expect(fit(scene, viewport)).toBeGreaterThan(1000 / (10 * 60 + 9 * 110 + 80));
  });

  test("the same chain in a portrait viewport runs top to bottom", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const scene = await lay(diagramOf({ components: ids.map((id) => comp(id)), connections: chain(ids) }), { width: 1000, height: 1600 });
    expect(scene.direction).toBe("DOWN");
    expect(new Set(ids.map((id) => rectOf(scene, id).x)).size).toBe(1);
  });

  test("a chain of very wide boxes fits better top to bottom", async () => {
    const ids = ["a", "b", "c", "d"];
    const scene = await lay(diagramOf({ components: ids.map((id) => comp(id, { label: id.repeat(68) })), connections: chain(ids) }), viewport);
    expect(rectOf(scene, "a").w).toBe(596);
    expect(scene.direction).toBe("DOWN");
    const ys = ids.map((id) => rectOf(scene, id).y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    // RIGHT would be at least 4·596 + 3·110 + 80 wide.
    expect(fit(scene, viewport)).toBeGreaterThan(1600 / (4 * 596 + 3 * 110 + 80));
  });

  test("ties pick RIGHT", async () => {
    const scene = await lay(diagramOf({ components: [comp("a")] }), viewport);
    expect(scene.direction).toBe("RIGHT");
    expect(scene.bounds).toEqual({ x: 0, y: 0, w: 200, h: 140 });
  });
});
