// FRS-04: diffs parse into old-side hunks, and boxes are marked by how the hunks touch what they cite.
import { describe, expect, test } from "vitest";
import { markChanges, parseDiff, rangeOf, unquotePath } from "../../../src/model/changes";

const DIFF = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -4 +4 @@ export function handle(req) {",
  "-  const body = parse(req);",
  "+  const body = parseJson(req);",
  "@@ -10,0 +11,2 @@ more",
  "+added",
  "+lines",
  "diff --git a/old name.ts b/new name.ts",
  "similarity index 100%",
  "rename from old name.ts",
  "rename to new name.ts",
  "diff --git a/gone.ts b/gone.ts",
  "deleted file mode 100644",
  "--- a/gone.ts",
  "+++ /dev/null",
  "@@ -1,3 +0,0 @@",
  'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"',
  "new file mode 100644",
  "--- /dev/null",
  '+++ "b/caf\\303\\251.ts"',
  "@@ -0,0 +1 @@",
  "+x",
  "",
].join("\n");

describe("FRS-04 diff parsing", () => {
  test("files, renames, deletions, additions and old-side hunks", () => {
    expect(parseDiff(DIFF)).toEqual([
      { path: "src/a.ts", oldPath: "src/a.ts", status: "modified", hunks: [{ oldStart: 4, oldLines: 1 }, { oldStart: 10, oldLines: 0 }], added: 3 },
      { path: "new name.ts", oldPath: "old name.ts", status: "renamed", hunks: [] },
      { path: "gone.ts", oldPath: "gone.ts", status: "deleted", hunks: [{ oldStart: 1, oldLines: 3 }], added: 0 },
      { path: "café.ts", oldPath: "café.ts", status: "added", hunks: [{ oldStart: 0, oldLines: 0 }], added: 1 },
    ]);
  });

  test("quoted paths are unquoted", () => {
    expect(unquotePath('"tab\\there \\"q\\""')).toBe('tab\there "q"');
    expect(unquotePath("plain.ts")).toBe("plain.ts");
  });
});

describe("FRS-04 marks", () => {
  const changes = parseDiff(DIFF);
  const components = [
    { id: "handler", sources: [{ path: "src/a.ts", line: 3, end_line: 6 }] },
    { id: "header", sources: [{ path: "src/a.ts", line: 1, end_line: 2 }] },
    { id: "tail", sources: [{ path: "src/a.ts", line: 10, end_line: 12 }] },
    { id: "edge", sources: [{ path: "src/a.ts", line: 11, end_line: 12 }] },
    { id: "renamed", sources: [{ path: "old name.ts", line: 1 }] },
    { id: "deleted", sources: [{ path: "gone.ts", line: 2 }] },
    { id: "whole", sources: [{ path: "src/a.ts" }] },
    { id: "calm", sources: [{ path: "src/z.ts", line: 1 }] },
  ];

  test("a touched range is strong, the rest of a changed file weak, and uncited files uncovered", () => {
    expect(markChanges(components, changes)).toEqual({
      strong: ["handler", "tail", "deleted", "whole"],
      weak: ["header", "edge", "renamed"],
      uncovered: ["café.ts"],
    });
  });
});

test("FRS-04 a commit range is two plain revisions", () => {
  expect(rangeOf(" main..HEAD ")).toEqual({ from: "main", to: "HEAD" });
  expect(rangeOf("v1.2.0..HEAD~3")).toEqual({ from: "v1.2.0", to: "HEAD~3" });
  for (const bad of ["main", "main...HEAD", "--output=x..HEAD", "a b..c", "main..$(rm)"]) expect(rangeOf(bad), bad).toBeNull();
});
