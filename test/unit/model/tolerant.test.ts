// FR-VIEW-03: tolerant parsing, one test per rule; every fixture parses with no skips.
import { describe, expect, test } from "vitest";
import { parseDiagram, readDiagram, type TolerantResult } from "../../../src/model/tolerant";
import { archifyFixtures } from "../support/fixtures";

function ok(result: TolerantResult): Extract<TolerantResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected a diagram, got: ${result.reason}`);
  return result;
}

interface RawDoc {
  meta: unknown;
  components: unknown[];
  connections?: unknown[];
  boundaries?: unknown[];
  layout?: unknown;
}

const base = (): RawDoc => ({
  meta: { title: "T" },
  components: [
    { id: "a", type: "frontend", label: "A", sources: [{ path: "src/a.ts", line: 1, end_line: 2, label: "entry" }] },
    { id: "b", type: "backend", label: "B" },
  ],
  connections: [{ from: "a", to: "b", label: "calls", variant: "emphasis" }],
  boundaries: [{ kind: "security-group", label: "App", wraps: ["a", "b"] }],
});

describe("FR-VIEW-03 tolerant parse", () => {
  test.each(archifyFixtures().map((fixture) => [fixture.name, fixture.text]))("%s parses with no skips", (_name, text) => {
    const result = ok(parseDiagram(text));
    expect(result.skipped).toEqual([]);
    const raw: unknown = JSON.parse(text);
    const expected = raw && typeof raw === "object" && "components" in raw && Array.isArray(raw.components) ? raw.components.length : -1;
    expect(result.diagram.components.length).toBe(expected);
  });

  test("a well-formed document keeps every part", () => {
    const { diagram } = ok(readDiagram(base()));
    expect(diagram).toEqual({
      title: "T",
      components: [
        { id: "a", type: "frontend", label: "A", sources: [{ path: "src/a.ts", line: 1, end_line: 2, label: "entry" }] },
        { id: "b", type: "backend", label: "B", sources: [] },
      ],
      connections: [{ from: "a", to: "b", label: "calls", variant: "emphasis" }],
      boundaries: [{ kind: "security-group", label: "App", wraps: ["a", "b"] }],
    });
  });

  test.each([
    ["{ not json", /^invalid JSON/],
    ["[1, 2]", /root is not a JSON object/],
    ["null", /root is not a JSON object/],
    ['{"meta": {}}', /no components/],
    ['{"components": []}', /no components/],
    ['{"components": [{"label": "no id"}]}', /no components with an id/],
  ])("%s fails: %s", (text, reason) => {
    const result = parseDiagram(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  test("components without a string id are skipped", () => {
    const doc = base();
    doc.components.push({ id: 7, label: "X" }, "not an object");
    const result = ok(readDiagram(doc));
    expect(result.diagram.components.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.skipped).toEqual(["/components/2: no string id", "/components/3: no string id"]);
  });

  test("duplicate ids after the first are skipped", () => {
    const doc = base();
    doc.components.push({ id: "a", type: "database", label: "Second A" });
    const { diagram, skipped } = ok(readDiagram(doc));
    expect(diagram.components.filter((c) => c.id === "a")).toEqual([expect.objectContaining({ label: "A", type: "frontend" })]);
    expect(skipped).toEqual(["/components/2: duplicate id a"]);
  });

  test("a missing label falls back to the id; an unknown type becomes external", () => {
    const doc = base();
    doc["components"] = [{ id: "a", type: "mainframe" }, { id: "b", label: "" }];
    const { diagram } = ok(readDiagram(doc));
    expect(diagram.components.map((c) => [c.label, c.type])).toEqual([
      ["a", "external"],
      ["b", "external"],
    ]);
  });

  test("connections whose from/to do not resolve are skipped", () => {
    const doc = base();
    doc["connections"] = [{ from: "a", to: "ghost" }, { from: "ghost", to: "b" }, { from: "a" }, { from: "b", to: "a", variant: "zigzag" }];
    const { diagram, skipped } = ok(readDiagram(doc));
    expect(diagram.connections).toEqual([{ from: "b", to: "a", variant: "default" }]);
    expect(skipped).toHaveLength(3);
  });

  test("unresolved boundary members are dropped and an emptied boundary is skipped", () => {
    const doc = base();
    doc["boundaries"] = [
      { kind: "region", label: "Partly", wraps: ["a", "ghost", "a"] },
      { kind: "region", label: "Empty", wraps: ["ghost"] },
      { label: "No kind", wraps: ["b"] },
    ];
    const { diagram, skipped } = ok(readDiagram(doc));
    expect(diagram.boundaries).toEqual([
      { kind: "region", label: "Partly", wraps: ["a"] },
      { kind: "region", label: "No kind", wraps: ["b"] },
    ]);
    expect(skipped).toEqual(["/boundaries/0/wraps/1: does not resolve", "/boundaries/1/wraps/0: does not resolve", "/boundaries/1: no members left"]);
  });

  test("sources without a string path are skipped, keeping the order of the rest", () => {
    const doc = base();
    doc["components"] = [{ id: "a", label: "A", sources: [{ line: 3 }, { path: "x.ts", line: "4" }, "y.ts", { path: "z.ts", end_line: 9 }] }];
    const { diagram, skipped } = ok(readDiagram(doc));
    expect(diagram.components[0]!.sources).toEqual([{ path: "x.ts" }, { path: "z.ts", end_line: 9 }]);
    expect(skipped.filter((entry) => entry.includes("/sources/"))).toEqual(["/components/0/sources/0: no string path", "/components/0/sources/2: no string path"]);
  });

  test("authored geometry and a grid layout are carried for the layout", () => {
    const doc = base();
    doc["layout"] = { mode: "grid", cols: 3, origin: [10, 20], gapX: "wide" };
    doc["components"] = [{ id: "a", label: "A", pos: [1, 2], size: [100, 50] }, { id: "b", label: "B", row: 1, col: 2, pos: [1] }];
    const { diagram } = ok(readDiagram(doc));
    expect(diagram.grid).toEqual({ mode: "grid", cols: 3, origin: [10, 20] });
    expect(diagram.components[0]).toMatchObject({ pos: [1, 2], size: [100, 50] });
    expect(diagram.components[1]).toMatchObject({ row: 1, col: 2 });
    expect(diagram.components[1]!.pos).toBeUndefined();
  });
});
