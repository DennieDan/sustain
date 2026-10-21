// FR-LAY-02: every fixture lays out, boxes do not overlap, output is deterministic.
import { describe, expect, test } from "vitest";
import type { Scene } from "../../../../src/viewer/layout/scene";
import { readDiagram } from "../../../../src/core/tolerant";
import type { ViewDiagram } from "../../../../src/core/tolerant";
import { archifyFixtures } from "../../support/fixtures";
import { contains, lay, onBorder, overlaps } from "./helpers";

const parsed = archifyFixtures().map((f) => {
  const result = readDiagram(JSON.parse(f.text));
  if (!result.ok) throw new Error(`${f.name}: ${result.reason}`);
  return [f.name, result.diagram] as [string, ViewDiagram];
});

/** Every fixture as authored, and again with positions and cells removed to force auto mode. */
const fixtures: [string, ViewDiagram][] = parsed.flatMap(([name, diagram]) => [
  [name, diagram],
  [`${name} (auto)`, { ...diagram, components: diagram.components.map(({ pos: _pos, row: _row, col: _col, ...rest }) => rest) }],
]);

function overlappingPairs(scene: Scene): string[] {
  const pairs: string[] = [];
  scene.nodes.forEach((a, i) => {
    for (const b of scene.nodes.slice(i + 1)) if (overlaps(a.rect, b.rect)) pairs.push(`${a.id}/${b.id}`);
  });
  return pairs;
}

describe("FR-LAY-02 fixtures", () => {
  // Lays out all 48 diagrams at once, which takes several seconds when the whole suite runs in parallel.
  test("there are 24 fixtures, each in both modes", { timeout: 30_000 }, async () => {
    expect(parsed).toHaveLength(24);
    const modes = await Promise.all(fixtures.map(async ([name, diagram]) => [name, (await lay(diagram)).mode]));
    for (const [name, mode] of modes) if (name!.endsWith("(auto)")) expect(mode, name).toBe("auto");
    // The vendored fixtures all carry authored positions.
    expect(modes.filter(([, mode]) => mode === "authored")).toHaveLength(24);
  });

  test.each(fixtures)("%s lays out without overlapping boxes", async (_name, diagram) => {
    const scene = await lay(diagram);
    expect(scene.nodes.map((n) => [n.id, n.index])).toEqual(diagram.components.map((c, i) => [c.id, i]));
    expect(scene.edges.map((e) => [e.from, e.to, e.index])).toEqual(diagram.connections.map((c, i) => [c.from, c.to, i]));
    expect(scene.boundaries.map((b) => b.index).sort((a, b) => a - b)).toEqual(diagram.boundaries.map((_, i) => i));
    expect(overlappingPairs(scene)).toEqual([]);
    for (const node of scene.nodes) expect(contains(scene.bounds, node.rect)).toBe(true);
    for (const boundary of scene.boundaries) {
      expect(contains(scene.bounds, boundary.rect)).toBe(true);
      // Every member box lies inside its boundary.
      for (const id of diagram.boundaries[boundary.index]!.wraps) {
        expect(contains(boundary.rect, scene.nodes.find((n) => n.id === id)!.rect), `${boundary.label} ⊇ ${id}`).toBe(true);
      }
    }
    for (const edge of scene.edges) {
      expect(edge.points.length).toBeGreaterThanOrEqual(2);
      const from = scene.nodes.find((n) => n.id === edge.from)!.rect;
      const to = scene.nodes.find((n) => n.id === edge.to)!.rect;
      expect(onBorder(from, edge.points[0]!), `edge ${edge.index} start`).toBe(true);
      expect(onBorder(to, edge.points.at(-1)!), `edge ${edge.index} end`).toBe(true);
      if (scene.mode === "auto" && edge.from !== edge.to) {
        // Orthogonal routing: every segment is horizontal or vertical.
        for (let i = 0; i + 1 < edge.points.length; i++) {
          const [a, b] = [edge.points[i]!, edge.points[i + 1]!];
          expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true);
        }
      }
    }
  });

  test.each(fixtures)("%s lays out identically twice", async (_name, diagram) => {
    const [first, second] = [await lay(diagram), await lay(structuredClone(diagram))];
    expect(second).toEqual(first);
  });
});
