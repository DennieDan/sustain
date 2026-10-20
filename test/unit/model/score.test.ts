// ACC-04: the eval scorer on maps with known scores.
import { expect, test } from "vitest";
import { score, type ScoredMap, type Truth } from "../../../src/model/score";

const TRUTH: Truth = {
  repo: "shop",
  revision: "a".repeat(40),
  source: "docs/architecture.md",
  components: [
    { id: "a", label: "Storefront", aliases: [], paths: ["src/a/**"] },
    { id: "b", label: "Orders", aliases: [], paths: ["src/b/**"] },
    { id: "c", label: "API gateway", aliases: ["Gateway"], paths: ["src/c/**"] },
    { id: "d", label: "Shared library", aliases: [], paths: ["lib/**"] },
  ],
  edges: [
    { from: "a", to: "b" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
  ],
  groups: [
    { id: "front", label: "Front end", members: ["a", "b"] },
    { id: "back", label: "Back end", members: ["c", "d"] },
  ],
};

test("ACC-04 a map with known matches, misses and a mixed group scores as worked out by hand", () => {
  const map: ScoredMap = {
    components: [
      { id: "x", label: "Shop", sources: [{ path: "src/a/one.ts" }, { path: "src/a/two.ts" }, { path: "src/z.ts" }] },
      { id: "y", label: "Orders", sources: [{ path: "src/b/one.ts" }, { path: "src/c/one.ts" }] },
      { id: "z", label: "Docs", sources: [{ path: "docs/x.md" }] },
      { id: "w", label: "gateway" },
      { id: "v", label: "Utils", sources: [{ path: "lib/q.ts" }, { path: "lib/q.ts" }] },
    ],
    connections: [
      { from: "x", to: "y" },
      { from: "w", to: "y" },
      { from: "x", to: "v" },
      { from: "z", to: "x" },
    ],
    boundaries: [
      { label: "Front", wraps: ["x", "y"] },
      { label: "Mixed", wraps: ["y", "v"] },
      { wraps: ["x", "w"] },
    ],
  };
  expect(score(map, TRUTH)).toEqual({
    matches: { x: "a", y: "b", z: null, w: "c", v: "d" },
    precision: 0.75,
    recall: 1,
    edges: { precision: 0.6667, recall: 0.6667 },
    groupingErrors: ["Mixed", "group 3"],
    citationSupport: 0.5714,
  });
});

test("ACC-04 a map that is the truth scores 1 everywhere, and an empty map 0", () => {
  const perfect: ScoredMap = {
    components: TRUTH.components.map((component) => ({ id: component.id, label: component.label, sources: [{ path: component.paths[0]!.replace("**", "main.ts") }] })),
    connections: TRUTH.edges,
    boundaries: TRUTH.groups.map((group) => ({ label: group.label, wraps: group.members })),
  };
  expect(score(perfect, TRUTH)).toMatchObject({ precision: 1, recall: 1, edges: { precision: 1, recall: 1 }, groupingErrors: [], citationSupport: 1 });
  expect(score({ components: [], connections: [] }, TRUTH)).toMatchObject({ precision: 0, recall: 0, edges: { precision: 0, recall: 0 }, citationSupport: 0 });
});
