// FR-CMP-03: diagram diff, one test per key and rule; markKept.
import { describe, expect, test } from "vitest";
import { diffDiagrams, markKept } from "../../../src/core/diagramDiff";
import { readDiagram, type ViewDiagram } from "../../../src/core/tolerant";

interface RawDoc {
  components: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  boundaries: Record<string, unknown>[];
  layout?: unknown;
}

const raw = (): RawDoc => ({
  components: [
    { id: "a", type: "frontend", label: "A", sublabel: "web", tag: "ui", sources: [{ path: "src/a.ts", line: 1, label: "entry" }] },
    { id: "b", type: "backend", label: "B", sources: [{ path: "src/b.ts" }] },
    { id: "c", type: "database", label: "C" },
  ],
  connections: [
    { id: "ab", from: "a", to: "b", label: "calls" },
    { id: "bc", from: "b", to: "c" },
  ],
  boundaries: [
    { kind: "region", label: "App", wraps: ["a", "b"] },
    { kind: "region", label: "Data", wraps: ["c"] },
  ],
});

function view(doc: RawDoc): ViewDiagram {
  const result = readDiagram(doc);
  if (!result.ok) throw new Error(result.reason);
  return result.diagram;
}

function diff(baseline: RawDoc, current: RawDoc) {
  return diffDiagrams(view(baseline), view(current));
}

describe("FR-CMP-03 diagram diff", () => {
  test("equal documents with different layouts are all unchanged with counts 0", () => {
    const current = raw();
    current.layout = { mode: "grid", cols: 2 };
    current.components[0]!["pos"] = [10, 20];
    current.components[1]!["size"] = [100, 40];
    current.components[2]!["row"] = 3;
    const result = diff(raw(), current);
    for (const d of [...result.components, ...result.connections, ...result.boundaries]) expect(d).toEqual({ status: "unchanged", fields: [] });
    expect(result.removed).toEqual({ components: [], connections: [], boundaries: [] });
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 0 });
  });

  test("components match by id: added, removed and changed text fields in order", () => {
    const current = raw();
    current.components[0] = { id: "a", type: "backend", label: "A2", tag: "ui" };
    current.components.splice(2, 1, { id: "d", label: "D" });
    current.connections = [current.connections[0]!];
    current.boundaries = [current.boundaries[0]!];
    const result = diff(raw(), current);
    expect(result.components[0]).toEqual({
      status: "changed",
      fields: [
        { field: "label", before: "A", after: "A2" },
        { field: "sublabel", before: "web", after: null },
        { field: "type", before: "frontend", after: "backend" },
        { field: "sources" },
      ],
    });
    expect(result.components[2]!.status).toBe("added");
    expect(result.removed.components.map((c) => c.id)).toEqual(["c"]);
  });

  test("a line-only citation change leaves a component unchanged", () => {
    const current = raw();
    current.components[0]!["sources"] = [{ path: "src/a.ts", line: 40, end_line: 52, label: "renamed" }];
    expect(diff(raw(), current).components[0]).toEqual({ status: "unchanged", fields: [] });
  });

  test("moving a component to another boundary changes its boundary field", () => {
    const current = raw();
    current.boundaries = [
      { kind: "region", label: "App", wraps: ["a"] },
      { kind: "region", label: "Data", wraps: ["b", "c"] },
    ];
    const result = diff(raw(), current);
    expect(result.components.map((d) => d.status)).toEqual(["unchanged", "changed", "unchanged"]);
    expect(result.components[1]!.fields).toEqual([{ field: "boundary" }]);
    expect(result.boundaries).toEqual([
      { status: "changed", fields: [{ field: "members" }] },
      { status: "changed", fields: [{ field: "members" }] },
    ]);
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 3 });
  });

  test("connections match by id and compare label and variant", () => {
    const current = raw();
    current.connections[0] = { id: "ab", from: "a", to: "b", label: "reads", variant: "dashed" };
    expect(diff(raw(), current).connections[0]).toEqual({
      status: "changed",
      fields: [
        { field: "label", before: "calls", after: "reads" },
        { field: "variant", before: "default", after: "dashed" },
      ],
    });
  });

  test("an id-less legacy pair matches by ~from→to", () => {
    const baseline = raw();
    const current = raw();
    for (const doc of [baseline, current]) doc.connections = doc.connections.map(({ id: _id, ...rest }) => rest);
    current.connections[1]!["label"] = "stores";
    const result = diff(baseline, current);
    expect(result.connections).toEqual([
      { status: "unchanged", fields: [] },
      { status: "changed", fields: [{ field: "label", before: null, after: "stores" }] },
    ]);
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  test("duplicate connection keys get #2, #3 in document order", () => {
    const baseline = raw();
    baseline.connections = [
      { from: "a", to: "b", label: "one" },
      { from: "a", to: "b", label: "two" },
    ];
    const current = raw();
    current.connections = [
      { from: "a", to: "b", label: "one" },
      { from: "a", to: "b", label: "two" },
      { from: "a", to: "b", label: "three" },
    ];
    const result = diff(baseline, current);
    expect(result.connections.map((d) => d.status)).toEqual(["unchanged", "unchanged", "added"]);
    expect(result.counts).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  test("an endpoint move under the same id is one removal plus one addition", () => {
    const current = raw();
    current.connections[0] = { id: "ab", from: "a", to: "c", label: "calls" };
    const result = diff(raw(), current);
    expect(result.connections[0]).toEqual({ status: "added", fields: [] });
    expect(result.removed.connections).toEqual([{ id: "ab", from: "a", to: "b", label: "calls", variant: "default" }]);
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 0 });
  });

  test("boundaries match by label and compare kind", () => {
    const current = raw();
    current.boundaries[1]!["kind"] = "security-group";
    expect(diff(raw(), current).boundaries[1]).toEqual({ status: "changed", fields: [{ field: "kind", before: "region", after: "security-group" }] });
  });

  test("a relabelled boundary with equal members is renamed and its members stay unchanged", () => {
    const current = raw();
    current.boundaries[0] = { kind: "security-group", label: "Frontend", wraps: ["b", "a"] };
    const result = diff(raw(), current);
    expect(result.boundaries[0]).toEqual({
      status: "renamed",
      fields: [
        { field: "label", before: "App", after: "Frontend" },
        { field: "kind", before: "region", after: "security-group" },
      ],
    });
    expect(result.components.every((d) => d.status === "unchanged")).toBe(true);
    expect(result.removed.boundaries).toEqual([]);
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 1 });
  });

  test("a relabelled boundary with other members is removed plus added", () => {
    const current = raw();
    current.boundaries[0] = { kind: "region", label: "Frontend", wraps: ["a"] };
    const result = diff(raw(), current);
    expect(result.boundaries[0]!.status).toBe("added");
    expect(result.removed.boundaries.map((b) => b.label)).toEqual(["App"]);
    expect(result.components.map((d) => d.status)).toEqual(["changed", "changed", "unchanged"]);
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 2 });
  });

  test("markKept marks touched unchanged components only, leaving counts and the input alone", () => {
    const current = raw();
    current.components[1]!["label"] = "B2";
    const currentView = view(current);
    const result = diffDiagrams(view(raw()), currentView);
    const kept = markKept(result, currentView, new Set(["a", "b", "zz"]));
    expect(kept.components.map((d) => d.status)).toEqual(["kept", "changed", "unchanged"]);
    expect(kept.counts).toEqual(result.counts);
    expect(result.components[0]!.status).toBe("unchanged");
  });
});
