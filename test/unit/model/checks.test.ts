// FR-VAL-04: one test per semantic rule, asserting the pointer (ported from validation.rs).
import { describe, expect, test } from "vitest";
import { boundaryRelation, semanticChecks } from "../../../src/model/checks";
import type { ArchifyDoc } from "../../../src/model/types";

function base(): ArchifyDoc {
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "T", output: "out/t.html" },
    components: [
      { id: "a", type: "frontend", label: "A", sources: [{ path: "src/a.ts", line: 1 }] },
      { id: "b", type: "backend", label: "B", sources: [{ path: "src/b.ts" }] },
      { id: "c", type: "database", label: "C", sources: [{ path: "src/c.ts" }] },
    ],
    connections: [{ id: "ab", from: "a", to: "b" }],
    boundaries: [{ kind: "region", label: "R", wraps: ["a", "b"] }],
  };
}

describe("FR-VAL-04 semantic checks", () => {
  test("a valid document has no issues", () => {
    expect(semanticChecks(base())).toEqual([]);
  });

  test("duplicate component id → /components/i/id", () => {
    const doc = base();
    doc.components[2]!.id = "a";
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "DuplicateId", pointer: "/components/2/id" })]);
  });

  test("duplicate connection id → /connections/i/id", () => {
    const doc = base();
    doc.connections = [
      { id: "x", from: "a", to: "b" },
      { id: "x", from: "b", to: "c" },
    ];
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "DuplicateId", pointer: "/connections/1/id" })]);
  });

  test("connections without ids are never duplicates", () => {
    const doc = base();
    doc.connections = [
      { from: "a", to: "b" },
      { from: "a", to: "b" },
    ];
    expect(semanticChecks(doc)).toEqual([]);
  });

  test("unknown connection from → /connections/i/from", () => {
    const doc = base();
    doc.connections![0]!.from = "ghost";
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "UnknownReference", pointer: "/connections/0/from" })]);
  });

  test("unknown connection to → /connections/i/to", () => {
    const doc = base();
    doc.connections![0]!.to = "ghost";
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "UnknownReference", pointer: "/connections/0/to" })]);
  });

  test("unknown boundary member → /boundaries/i/wraps/j", () => {
    const doc = base();
    doc.boundaries![0]!.wraps = ["a", "ghost"];
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "UnknownReference", pointer: "/boundaries/0/wraps/1" })]);
  });

  test("component without sources → /components/i (MissingSources)", () => {
    const doc = base();
    delete doc.components[2]!.sources;
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "MissingSources", pointer: "/components/2" })]);
  });

  test("partially overlapping boundaries → /boundaries/j", () => {
    const doc = base();
    doc.boundaries = [
      { kind: "region", label: "R1", wraps: ["a", "b"] },
      { kind: "security-group", label: "R2", wraps: ["b", "c"] },
    ];
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "BoundaryOverlap", pointer: "/boundaries/1" })]);
  });

  test("boundaries with equal member sets → /boundaries/j", () => {
    const doc = base();
    doc.boundaries = [
      { kind: "region", label: "R1", wraps: ["a", "b"] },
      { kind: "region", label: "R2", wraps: ["b", "a"] },
    ];
    expect(semanticChecks(doc)).toEqual([expect.objectContaining({ code: "BoundaryOverlap", pointer: "/boundaries/1" })]);
  });

  test("nested and separate boundaries are fine", () => {
    const doc = base();
    doc.boundaries = [
      { kind: "region", label: "Outer", wraps: ["a", "b"] },
      { kind: "security-group", label: "Inner", wraps: ["b"] },
      { kind: "region", label: "Other", wraps: ["c"] },
    ];
    expect(semanticChecks(doc)).toEqual([]);
  });

  test("boundaryRelation classifies member sets", () => {
    const set = (...ids: string[]): Set<string> => new Set(ids);
    expect(boundaryRelation(set("a"), set("b"))).toBe("disjoint");
    expect(boundaryRelation(set("a", "b"), set("b", "a"))).toBe("equal");
    expect(boundaryRelation(set("a", "b"), set("b"))).toBe("contains");
    expect(boundaryRelation(set("b"), set("a", "b"))).toBe("containedBy");
    expect(boundaryRelation(set("a", "b"), set("b", "c"))).toBe("partialOverlap");
  });
});
