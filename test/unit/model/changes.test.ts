// FRS-04: diffs parse into old-side hunks, and boxes are marked by how the hunks touch what they cite.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { markChanges, parseDiff, rangeOf, unquotePath } from "../../../src/model/changes";
import { diffFor } from "../../../src/model/git";
import { git, gitRepo, put } from "../support/temp";

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
      { path: "src/a.ts", oldPath: "src/a.ts", status: "modified", hunks: [{ oldStart: 4, oldLines: 1 }, { oldStart: 10, oldLines: 0 }] },
      { path: "new name.ts", oldPath: "old name.ts", status: "renamed", hunks: [] },
      { path: "gone.ts", oldPath: "gone.ts", status: "deleted", hunks: [{ oldStart: 1, oldLines: 3 }] },
      { path: "café.ts", oldPath: "café.ts", status: "added", hunks: [{ oldStart: 0, oldLines: 0 }] },
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

describe("FRS-04 scopes in a git repository", () => {
  test("uncommitted changes include untracked files; a range compares two commits; bad ranges are refused", () => {
    const root = gitRepo({ "src/a.ts": "1\n2\n3\n" });
    const first = git(root, "rev-parse", "HEAD").trim();
    put(root, "src/a.ts", "1\nTWO\n3\n");
    git(root, "commit", "-qam", "two");
    put(root, "src/a.ts", "1\nTWO\nTHREE\n");
    writeFileSync(join(root, "new.ts"), "n\n");

    const uncommitted = diffFor(root, { kind: "uncommitted" });
    expect(uncommitted.ok && parseDiff(uncommitted.text)).toEqual([{ path: "src/a.ts", oldPath: "src/a.ts", status: "modified", hunks: [{ oldStart: 3, oldLines: 1 }] }]);
    expect(uncommitted.ok && uncommitted.untracked).toEqual(["new.ts"]);

    const range = diffFor(root, { kind: "range", from: first, to: "HEAD" });
    expect(range.ok && parseDiff(range.text)[0]!.hunks).toEqual([{ oldStart: 2, oldLines: 1 }]);
    expect(range.ok && range.untracked).toEqual([]);
    expect(diffFor(root, { kind: "range", from: "--output=/tmp/x", to: "HEAD" })).toEqual({ ok: false, reason: "A commit range looks like main..HEAD." });
  });

  test("this branch compares with its merge-base with main", () => {
    const root = gitRepo({ "a.ts": "1\n" });
    git(root, "checkout", "-qb", "feature");
    put(root, "a.ts", "2\n");
    git(root, "commit", "-qam", "feature");
    const branch = diffFor(root, { kind: "branch" });
    expect(branch.ok && parseDiff(branch.text).map((file) => file.path)).toEqual(["a.ts"]);
  });
});

test("FRS-04 a commit range is two plain revisions", () => {
  expect(rangeOf(" main..HEAD ")).toEqual({ from: "main", to: "HEAD" });
  expect(rangeOf("v1.2.0..HEAD~3")).toEqual({ from: "v1.2.0", to: "HEAD~3" });
  for (const bad of ["main", "main...HEAD", "--output=x..HEAD", "a b..c", "main..$(rm)"]) expect(rangeOf(bad), bad).toBeNull();
});
