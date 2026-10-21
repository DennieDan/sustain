// FR-MOD-01 (round-trip) and FR-MOD-02 (schema validation with JSON pointers).
import { describe, expect, test } from "vitest";
import { validateArchitecture } from "../../../src/core/schema";
import { stringifyDocument } from "../../../src/core/types";
import { archifyFixtures } from "../support/fixtures";

const fixtures = archifyFixtures();

function base(): Record<string, unknown> & { components: Record<string, unknown>[] } {
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "T", output: "out/t.html" },
    components: [
      { id: "a", type: "frontend", label: "A", sources: [{ path: "src/a.ts", line: 1 }] },
      { id: "b", type: "backend", label: "B", sources: [{ path: "src/b.ts" }] },
    ],
  };
}

describe("FR-MOD-01 types round-trip", () => {
  test("there are 24 vendored fixtures", () => {
    expect(fixtures).toHaveLength(24);
  });

  test.each(fixtures.map((fixture) => [fixture.name, fixture.text]))("%s round-trips parse → stringify as an equal JSON value", (_name, text) => {
    const parsed: unknown = JSON.parse(text);
    const rewritten = stringifyDocument(parsed);
    expect(JSON.parse(rewritten)).toEqual(JSON.parse(text));
    expect(rewritten.endsWith("}\n")).toBe(true);
  });
});

describe("FR-MOD-02 schema", () => {
  test.each(fixtures.map((fixture) => [fixture.name, fixture.text]))("%s passes the vendored schema", (_name, text) => {
    expect(validateArchitecture(JSON.parse(text))).toEqual([]);
  });

  test("an unknown component type points at /components/1/type", () => {
    const doc = base();
    doc.components[1]!["type"] = "nope";
    const issues = validateArchitecture(doc);
    expect(issues.map((issue) => issue.pointer)).toEqual(["/components/1/type"]);
    expect(issues[0]!.code).toBe("Schema");
    expect(issues[0]!.message).toContain('"external"');
  });

  test("an extra field points at the extra property", () => {
    const doc = base();
    doc.components[0]!["colour"] = "red";
    const issues = validateArchitecture(doc);
    expect(issues.map((issue) => issue.pointer)).toEqual(["/components/0/colour"]);
    expect(issues[0]!.message).toContain("colour");
  });

  test("an extra root field with a pointer-special name is escaped", () => {
    const doc = { ...base(), "a/b~c": 1 };
    expect(validateArchitecture(doc).map((issue) => issue.pointer)).toEqual(["/a~1b~0c"]);
  });

  test("all errors are reported, not just the first", () => {
    const doc = base();
    doc.components[0]!["type"] = "nope";
    doc.components[1]!["label"] = "";
    const pointers = validateArchitecture(doc).map((issue) => issue.pointer);
    expect(pointers).toContain("/components/0/type");
    expect(pointers).toContain("/components/1/label");
  });

  test("a missing required property is reported at the owning object", () => {
    const doc = base();
    delete doc.components[1]!["label"];
    const issues = validateArchitecture(doc);
    expect(issues.map((issue) => issue.pointer)).toEqual(["/components/1"]);
    expect(issues[0]!.message).toContain("label");
  });

  test.each([["[]"], ["null"], ["42"], ['"x"'], ["{}"]])("non-document %s fails without throwing", (text) => {
    expect(validateArchitecture(JSON.parse(text)).length).toBeGreaterThan(0);
  });

  test.each([["../x.html"], ["/abs/x.html"], ["a/b.txt"], ["a\\b.html"], ["con/x.html"], ["a./b.html"]])(
    "meta.output %s violates portableOutputPath",
    (output) => {
      const doc = { ...base(), meta: { title: "T", output } };
      expect(validateArchitecture(doc).some((issue) => issue.pointer === "/meta/output")).toBe(true);
    },
  );

  test("a run-folder output path is valid", () => {
    const doc = { ...base(), meta: { title: "T", output: ".archify/architecture-x-20261010-101010/x.html" } };
    expect(validateArchitecture(doc)).toEqual([]);
  });
});
