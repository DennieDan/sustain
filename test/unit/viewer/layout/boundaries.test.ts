// FR-LAY-03 boundaries: hierarchy placement, overlay rectangles, authored padding.
import { describe, expect, test } from "vitest";
import { hierarchy } from "../../../../src/viewer/layout/boundaries";
import type { Scene, SceneBoundary } from "../../../../src/viewer/layout/scene";
import { chain, comp, contains, diagramOf, lay, overlaps, rectOf } from "./helpers";

function boundary(scene: Scene, label: string): SceneBoundary {
  const found = scene.boundaries.find((b) => b.label === label);
  if (!found) throw new Error(`no boundary ${label}`);
  return found;
}

describe("FR-LAY-03 hierarchy", () => {
  const sets = (...lists: number[][]) => lists.map((l) => new Set(l));

  test("disjoint and strictly nested sets are placed; parents are the smallest strict superset", () => {
    // 0 = {0,1}, 1 = {0,1,2,3} (placed after its child), 2 = {3}, 3 = {4}
    const h = hierarchy(sets([0, 1], [0, 1, 2, 3], [3], [4]), 6);
    expect(h.placed).toEqual([0, 1, 2, 3]);
    expect(h.parent).toEqual([1, undefined, 1, undefined]);
    expect(h.componentParent).toEqual([0, 0, 1, 2, 3, undefined]);
  });

  test("partial overlaps and equal sets are not placed; later boundaries are checked against placed ones only", () => {
    // 1 overlaps 0 partially; 2 equals 0; 3 overlaps 1 (not placed) but is disjoint from 0.
    const h = hierarchy(sets([0, 1], [1, 2], [0, 1], [2, 3]), 4);
    expect(h.placed).toEqual([0, 3]);
    expect(h.parent).toEqual([undefined, undefined, undefined, undefined]);
    expect(h.componentParent).toEqual([0, 0, 3, 3]);
  });
});

describe("FR-LAY-03 auto mode", () => {
  test("nested boundaries put child boxes inside parent boxes", async () => {
    const scene = await lay(
      diagramOf({
        components: ["a", "b", "c", "d", "e"].map((id) => comp(id)),
        connections: chain(["a", "b", "c", "d", "e"]),
        boundaries: [
          { kind: "region", label: "outer", wraps: ["a", "b", "c"] },
          { kind: "security-group", label: "inner", wraps: ["a", "b"] },
        ],
      }),
    );
    const outer = boundary(scene, "outer");
    const inner = boundary(scene, "inner");
    expect([outer.nested, inner.nested]).toEqual([true, true]);
    expect(inner.kind).toBe("security-group");
    expect(scene.boundaries.map((b) => b.label)).toEqual(["outer", "inner"]);
    expect(contains(outer.rect, inner.rect)).toBe(true);
    for (const id of ["a", "b"]) expect(contains(inner.rect, rectOf(scene, id))).toBe(true);
    expect(contains(outer.rect, rectOf(scene, "c"))).toBe(true);
    expect(overlaps(inner.rect, rectOf(scene, "c"))).toBe(false);
    for (const id of ["d", "e"]) expect(overlaps(outer.rect, rectOf(scene, id))).toBe(false);
    // Room for the label: the top padding is larger than the side padding.
    const a = rectOf(scene, "a");
    const b = rectOf(scene, "b");
    const top = Math.min(a.y, b.y) - inner.rect.y;
    const left = Math.min(a.x, b.x) - inner.rect.x;
    expect(top).toBeGreaterThanOrEqual(36);
    expect(left).toBeGreaterThanOrEqual(20);
  });

  test("overlapping boundaries produce both rectangles, neither nested", async () => {
    const scene = await lay(
      diagramOf({
        components: ["a", "b", "c"].map((id) => comp(id)),
        connections: chain(["a", "b", "c"]),
        boundaries: [
          { kind: "region", label: "left", wraps: ["a", "b"] },
          { kind: "region", label: "right", wraps: ["b", "c"] },
        ],
      }),
    );
    const left = boundary(scene, "left");
    const right = boundary(scene, "right");
    expect(left.nested).toBe(true);
    expect(right.nested).toBe(false);
    expect(contains(left.rect, right.rect) || contains(right.rect, left.rect)).toBe(false);
    // The overlay is the member boxes' bounding box plus 16 px.
    const b = rectOf(scene, "b");
    const c = rectOf(scene, "c");
    const x = Math.min(b.x, c.x);
    const y = Math.min(b.y, c.y);
    expect(right.rect).toEqual({
      x: x - 16,
      y: y - 16,
      w: Math.max(b.x + b.w, c.x + c.w) - x + 32,
      h: Math.max(b.y + b.h, c.y + c.h) - y + 32,
    });
  });

  test("a boundary equal to a placed one is an overlay", async () => {
    const scene = await lay(
      diagramOf({
        components: ["a", "b"].map((id) => comp(id)),
        connections: chain(["a", "b"]),
        boundaries: [
          { kind: "region", label: "first", wraps: ["a", "b"] },
          { kind: "region", label: "second", wraps: ["b", "a"] },
        ],
      }),
    );
    expect(boundary(scene, "first").nested).toBe(true);
    expect(boundary(scene, "second").nested).toBe(false);
    expect(contains(boundary(scene, "first").rect, boundary(scene, "second").rect)).toBe(true);
    expect(scene.boundaries.map((b) => b.label)).toEqual(["first", "second"]);
  });
});

describe("FR-LAY-03 authored mode", () => {
  test("rectangles pad members 30 px left/top/right and 50 px below and include nested boundaries", async () => {
    const scene = await lay(
      diagramOf({
        components: [comp("a", { pos: [100, 100] }), comp("b", { pos: [300, 100], size: [100, 80] }), comp("c", { pos: [600, 400] })],
        boundaries: [
          { kind: "region", label: "inner", wraps: ["a", "b"] },
          { kind: "region", label: "outer", wraps: ["a", "b", "c"] },
          { kind: "region", label: "overlap", wraps: ["b", "c"] },
        ],
      }),
    );
    expect(scene.boundaries.every((b) => !b.nested)).toBe(true);
    // a ∪ b = (100,100)–(400,180).
    expect(boundary(scene, "inner").rect).toEqual({ x: 70, y: 70, w: 360, h: 160 });
    // Members ∪ both strictly contained boundaries: inner (70,70)–(430,230) and overlap (270,70)–(750,510).
    expect(boundary(scene, "outer").rect).toEqual({ x: 40, y: 40, w: 740, h: 520 });
    // b (300,100)–(400,180) ∪ c, padded; partial overlap with inner does not nest.
    expect(boundary(scene, "overlap").rect).toEqual({ x: 270, y: 70, w: 480, h: 440 });
    expect(scene.boundaries.map((b) => b.label)).toEqual(["outer", "overlap", "inner"]);
  });
});
