// FR-LAY-01 mode selection and grid conversion; FR-LAY-02 node sizing.
import { describe, expect, test } from "vitest";
import { autoNodeSize } from "../../../src/layout/measure";
import { authoredRects } from "../../../src/layout/mode";
import { readDiagram } from "../../../src/core/tolerant";
import { archifyFixtures } from "../support/fixtures";
import { comp, diagramOf, fixedAdvance, lay, rectOf } from "./helpers";

describe("FR-LAY-01 mode", () => {
  test("the archify-repo-grid fixture resolves to the prototype's positions", async () => {
    const fixture = archifyFixtures().find((f) => f.name === "examples/archify-repo-grid.architecture.json")!;
    const result = readDiagram(JSON.parse(fixture.text));
    if (!result.ok) throw new Error(result.reason);
    const scene = await lay(result.diagram);
    expect(scene.mode).toBe("authored");
    expect(scene.direction).toBeUndefined();
    // origin [40,100], gapX 24, gapY 48, cellW 120, cellH 60 → step 144 × 108.
    const expected: [string, number, number][] = [
      ["user", 40, 208],
      ["agents", 184, 208],
      ["skill", 184, 100],
      ["ir", 328, 208],
      ["schemas", 328, 100],
      ["renderers", 472, 208],
      ["template", 616, 208],
      ["checker", 760, 208],
      ["html", 904, 208],
    ];
    for (const [id, x, y] of expected) expect(rectOf(scene, id), id).toEqual({ x, y, w: 120, h: 60 });
  });

  test("every component with pos → authored, with size or the 120×60 default", async () => {
    const scene = await lay(diagramOf({ components: [comp("a", { pos: [10, 20], size: [200, 90] }), comp("b", { pos: [400, 0] })] }));
    expect(scene.mode).toBe("authored");
    expect(rectOf(scene, "a")).toEqual({ x: 10, y: 20, w: 200, h: 90 });
    expect(rectOf(scene, "b")).toEqual({ x: 400, y: 0, w: 120, h: 60 });
  });

  test("grid cells use Archify's defaults for missing grid fields", () => {
    const rects = authoredRects(diagramOf({ layout: { mode: "grid" }, components: [comp("a", { row: 0, col: 0 }), comp("b", { row: 1, col: 2 })] }));
    // origin [40,80]; step (130+30) × (64+40).
    expect(rects).toEqual([
      { x: 40, y: 80, w: 120, h: 60 },
      { x: 360, y: 184, w: 120, h: 60 },
    ]);
  });

  test("pos wins over a grid cell", () => {
    const rects = authoredRects(diagramOf({ layout: { mode: "grid" }, components: [comp("a", { row: 3, col: 3, pos: [5, 6] })] }));
    expect(rects).toEqual([{ x: 5, y: 6, w: 120, h: 60 }]);
  });

  test("row/col without a grid layout is not an authored rect", async () => {
    const scene = await lay(diagramOf({ components: [comp("a", { row: 0, col: 0 }), comp("b", { row: 0, col: 1 })] }));
    expect(scene.mode).toBe("auto");
  });

  test("a grid cell needs both row and col", () => {
    expect(authoredRects(diagramOf({ layout: { mode: "grid" }, components: [comp("a", { row: 0 })] }))).toBeUndefined();
  });

  test("partial positions → auto, ignoring the given positions", async () => {
    const scene = await lay(diagramOf({ components: [comp("a", { pos: [900, 900], size: [300, 300] }), comp("b")], connections: [{ from: "a", to: "b" }] }));
    expect(scene.mode).toBe("auto");
    expect(scene.direction).toBeDefined();
    // Measured size, not the authored one; drawing starts at the 40 px margin.
    expect(rectOf(scene, "a")).toMatchObject({ w: 120, h: 60 });
    expect(Math.min(...scene.nodes.map((n) => n.rect.x))).toBe(40);
    expect(Math.min(...scene.nodes.map((n) => n.rect.y))).toBe(40);
  });
});

describe("FR-LAY-02 node size", () => {
  const diagram = diagramOf({
    components: [
      comp("gw", { label: "Gateway Service", sublabel: "routes requests to backends", tag: "v2" }),
      comp("a", { label: "A" }),
      comp("w", { label: "x".repeat(40) }),
    ],
  });

  test("auto sizes are exact with a fixed advance", () => {
    // max(15·8.4, 27·7.2, 2·6.6) + 24 = 218.4 → 219; 18.48 + 15.84 + 14.52 + 20 = 68.84 → 69
    expect(autoNodeSize(diagram.components[0]!, fixedAdvance)).toEqual({ w: 219, h: 69 });
    // Minimum 120×60.
    expect(autoNodeSize(diagram.components[1]!, fixedAdvance)).toEqual({ w: 120, h: 60 });
    // 40·8.4 + 24 = 360
    expect(autoNodeSize(diagram.components[2]!, fixedAdvance)).toEqual({ w: 360, h: 60 });
  });

  test("the label is measured bold at 14 px, sublabel and tag regular at 12 and 11 px", () => {
    const calls: [string, number, boolean][] = [];
    autoNodeSize(diagram.components[0]!, (text, size, bold) => {
      calls.push([text, size, bold]);
      return { width: 0, height: 0 };
    });
    expect(calls).toEqual([
      ["Gateway Service", 14, true],
      ["routes requests to backends", 12, false],
      ["v2", 11, false],
    ]);
  });

  test("the scene uses the measured sizes", async () => {
    const scene = await lay(diagram);
    expect(scene.nodes.map((n) => [n.rect.w, n.rect.h])).toEqual([
      [219, 69],
      [120, 60],
      [360, 60],
    ]);
  });
});
