// FR-UPD-02 mode decision and FR-UPD-03 diff parsing, mapping and rendering (pure parts).
// The diff and mapping cases port the change collection study's harness/test/change-input.test.mjs.
import { describe, expect, test } from "vitest";
import {
  addedFileDiff,
  collectChanges,
  decideMode,
  diagramComponents,
  mapChanges,
  renderChange,
  renderMapping,
  splitDiff,
  touchedFiles,
  type ChangeInput,
  type ModeFacts,
} from "../../../src/core/changeMap";
import { parseNameStatusZ, unquotePath } from "../../../src/core/gitFormat";
import type { Lineage } from "../../../src/model/lineage";

const raw = `diff --git a/src/Parser.java b/src/Parser.java
index 1111111..2222222 100644
--- a/src/Parser.java
+++ b/src/Parser.java
@@ -10,3 +10,4 @@ class Parser {
   a
+  b
   c
@@ -40 +41 @@ class Parser {
-x
+y
diff --git a/src/Old Name.java b/src/NewName.java
similarity index 100%
rename from src/Old Name.java
rename to src/NewName.java
diff --git a/src/Added.java b/src/Added.java
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/Added.java
@@ -0,0 +1 @@
+class Added {}
diff --git a/img/logo.png b/img/logo.png
deleted file mode 100644
index 4444444..0000000
Binary files a/img/logo.png and /dev/null differ
`;

const components = diagramComponents({
  components: [
    { id: "parser", label: "Parser", sources: [{ path: "src/Parser.java" }] },
    { id: "legacy", label: "Legacy", sources: [{ path: "src/Old Name.java" }] },
    { id: "ui", label: "UI", sources: [{ path: "src/Ui.java" }] },
  ],
});
const entries = [
  { status: "M", path: "src/Parser.java" },
  { status: "R100", path: "src/NewName.java", oldPath: "src/Old Name.java" },
  { status: "A", path: "src/Added.java" },
  { status: "D", path: "img/logo.png" },
];

describe("FR-UPD-03 diff parsing (ported)", () => {
  test("splitDiff recovers paths for edits, pure renames, additions and binary deletions", () => {
    const files = splitDiff(raw);
    expect(files.map((f) => [f.oldPath, f.newPath])).toEqual([
      ["src/Parser.java", "src/Parser.java"],
      ["src/Old Name.java", "src/NewName.java"],
      [null, "src/Added.java"],
      ["img/logo.png", null],
    ]);
    expect(files[0]?.hunks.map((h) => [h.oldStart, h.oldLines, h.newStart, h.newLines])).toEqual([
      [10, 3, 10, 4],
      [40, 1, 41, 1],
    ]);
  });

  test("a rename touches both paths", () => {
    expect([...touchedFiles([{ status: "R100", path: "b.txt", oldPath: "a.txt" }, { status: "M", path: "c.txt" }])].sort()).toEqual([
      "a.txt",
      "b.txt",
      "c.txt",
    ]);
  });

  test("mapChanges groups hunks by cited files, including a component citing a renamed file's old path", () => {
    const map = mapChanges(components, { fileDiffs: splitDiff(raw), entries });
    expect(map.touchedComponents.map((c) => [c.id, c.diffs.length])).toEqual([
      ["parser", 1],
      ["legacy", 1],
    ]);
    expect(map.untouched.map((c) => c.id)).toEqual(["ui"]);
    expect(map.uncited.map((e) => e.path)).toEqual(["src/Added.java", "img/logo.png"]);
  });
});

describe("FR-UPD-03 git output edge cases", () => {
  test("quoted and tab-terminated header paths are decoded", () => {
    const quoted = [
      'diff --git "a/caf\\303\\251.ts" "b/caf\\303\\251.ts"',
      "index 1..2 100644",
      '--- "a/caf\\303\\251.ts"',
      '+++ "b/caf\\303\\251.ts"',
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/with space.ts b/with space.ts",
      "--- a/with space.ts\t",
      "+++ b/with space.ts\t",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "",
    ].join("\n");
    expect(splitDiff(quoted).map((f) => [f.oldPath, f.newPath])).toEqual([
      ["café.ts", "café.ts"],
      ["with space.ts", "with space.ts"],
    ]);
    expect(unquotePath('"tab\\there \\"q\\" back\\\\"')).toBe('tab\there "q" back\\');
    expect(unquotePath("plain.ts")).toBe("plain.ts");
  });

  test("name-status -z keeps renames' old path and spaces verbatim", () => {
    expect(parseNameStatusZ("M\0a b.ts\0R087\0old.ts\0new.ts\0A\0c.ts\0")).toEqual([
      { status: "M", path: "a b.ts" },
      { status: "R087", path: "new.ts", oldPath: "old.ts" },
      { status: "A", path: "c.ts" },
    ]);
    expect(parseNameStatusZ("")).toEqual([]);
  });

  test("an untracked file becomes one added hunk", () => {
    const diff = addedFileDiff("src/new.ts", "one\ntwo\n");
    expect(diff.hunks).toEqual([{ header: "@@ -0,0 +1,2 @@", oldStart: 0, oldLines: 0, newStart: 1, newLines: 2 }]);
    expect(diff.text).toContain("+one\n+two\n");
    expect(addedFileDiff("x", "last").text).toContain("+last\n\\ No newline at end of file\n");
  });
});

describe("FR-UPD-03 collectChanges", () => {
  const input = (overrides: Partial<ChangeInput>): ChangeInput => ({
    nameStatus: "",
    diff: "",
    untracked: "",
    previousDirty: [],
    cited: new Set(),
    exists: () => true,
    readUntracked: () => null,
    ...overrides,
  });

  test("deny-listed and binary files keep only their names", () => {
    const diff = [
      "diff --git a/.env b/.env",
      "--- a/.env",
      "+++ b/.env",
      "@@ -1 +1 @@",
      "-TOKEN=old-secret",
      "+TOKEN=new-secret",
      "diff --git a/logo.png b/logo.png",
      "index 1..2 100644",
      "Binary files a/logo.png and b/logo.png differ",
      "",
    ].join("\n");
    const changes = collectChanges(input({ nameStatus: "M\0.env\0M\0logo.png\0", diff, cited: new Set([".env", "logo.png"]) }));
    expect(changes.fileDiffs.map((d) => d.note)).toEqual([
      "path on the citation deny-list; content not shown",
      "binary file; content not shown",
    ]);
    expect(changes.fileDiffs.map((d) => d.text).join("")).not.toContain("secret");
  });

  test("Sustain's own .archify/ output is left out", () => {
    const changes = collectChanges(
      input({ nameStatus: "M\0.archify/x/candidate.sir\0M\0a.ts\0", untracked: ".archify/run/lineage.json\0b.ts\0" }),
    );
    expect(changes.entries).toEqual([
      { status: "M", path: "a.ts" },
      { status: "A", path: "b.ts" },
    ]);
  });

  test("untracked files are added; only cited ones get content, deny-listed ones are never read", () => {
    const read: string[] = [];
    const changes = collectChanges(
      input({
        untracked: "new.ts\0cited.ts\0.env.local\0",
        cited: new Set(["cited.ts", ".env.local"]),
        readUntracked: (path) => {
          read.push(path);
          return "x\n";
        },
      }),
    );
    expect(changes.entries.map((e) => `${e.status} ${e.path}`)).toEqual(["A new.ts", "A cited.ts", "A .env.local"]);
    expect(read).toEqual(["cited.ts"]);
    expect(changes.fileDiffs.map((d) => [d.newPath, d.hunks.length, d.note])).toEqual([
      ["cited.ts", 1, undefined],
      [".env.local", 0, "untracked; content not shown"],
    ]);
  });

  test("previously dirty paths count as modified, deleted when gone, folders through cited files", () => {
    const changes = collectChanges(
      input({
        nameStatus: "M\0already.ts\0",
        previousDirty: ["already.ts", "kept.ts", "gone.ts", "newdir/"],
        cited: new Set(["kept.ts", "newdir/b.ts", "newdir/a.ts", "other/c.ts"]),
        exists: (path) => path !== "gone.ts",
      }),
    );
    expect(changes.entries.map((e) => `${e.status} ${e.path}`)).toEqual(["M already.ts", "M kept.ts", "D gone.ts", "M newdir/a.ts", "M newdir/b.ts"]);
    expect(changes.fileDiffs.map((d) => [d.oldPath, d.newPath])).toEqual([
      ["kept.ts", "kept.ts"],
      ["newdir/a.ts", "newdir/a.ts"],
      ["newdir/b.ts", "newdir/b.ts"],
    ]);
  });
});

describe("FR-UPD-03 renderings", () => {
  const map = mapChanges(components, { fileDiffs: splitDiff(raw), entries });
  const base = "a".repeat(40);
  const head = "b".repeat(40);

  test("change.md groups hunks under each touched component and lists uncited files by name-status", () => {
    const text = renderChange(base, head, map);
    expect(text.startsWith("# Code change from aaaaaaa to the working tree at bbbbbbb, grouped by diagram component\n")).toBe(true);
    expect(text).toContain("## Changed code by component\n\n### `parser` (Parser)\n\n```diff\ndiff --git a/src/Parser.java");
    expect(text).toContain("### `legacy` (Legacy)");
    expect(text).not.toContain("### `ui`");
    expect(text).toContain("## Changed files that no component cites\n\n```\nA\tsrc/Added.java\nD\timg/logo.png\n```\n");
  });

  test("mapping.md lists touched components with hunk headers, untouched components and uncited files", () => {
    const text = renderMapping(base, head, map);
    expect(text).toContain("- `parser` (Parser)\n  - src/Parser.java: @@ -10,3 +10,4 @@, @@ -40 +41 @@\n");
    expect(text).toContain("- `legacy` (Legacy)\n  - src/Old Name.java → src/NewName.java\n");
    expect(text).toContain("## Components whose cited files did not change\n\n- `ui` (UI)\n");
    expect(text).toContain("A\tsrc/Added.java");
  });

  test("an unchanged tree says so", () => {
    const empty = mapChanges(components, { fileDiffs: [], entries: [] });
    expect(renderChange(base, head, empty)).toContain("No component's cited files changed.");
    expect(renderMapping(base, head, empty)).toContain("## Components whose cited files changed\n\nNone.\n");
  });
});

describe("FR-UPD-02 mode decision", () => {
  const rev = "c".repeat(40);
  const lineage = (overrides: Partial<Lineage> = {}): Lineage => ({
    mode: "update",
    reason: "update",
    previousRun: null,
    baseRevision: null,
    revision: rev,
    baseCommit: null,
    headCommit: null,
    dirty: [],
    dirtyCount: 0,
    updatesSinceRegeneration: 1,
    ...overrides,
  });
  const facts = (overrides: Partial<ModeFacts> = {}): ModeFacts => ({
    requested: false,
    hasPrevious: true,
    hasGit: true,
    previousLineage: lineage(),
    candidateRevision: null,
    baseReachable: () => true,
    ...overrides,
  });

  test.each<[string, Partial<ModeFacts>, string]>([
    ["requested wins over everything", { requested: true, hasPrevious: false, hasGit: false }, "requested"],
    ["no previous", { hasPrevious: false, hasGit: false }, "no-previous"],
    ["no git", { hasGit: false, previousLineage: null }, "no-git"],
    ["no lineage, no candidate revision", { previousLineage: null }, "no-base-revision"],
    ["dirty baseline", { previousLineage: lineage({ dirtyCount: 201 }), baseReachable: () => false }, "dirty-baseline"],
    ["unreachable base", { baseReachable: () => false, previousLineage: lineage({ updatesSinceRegeneration: 9 }) }, "base-unreachable"],
    ["5 updates", { previousLineage: lineage({ updatesSinceRegeneration: 5 }) }, "scheduled"],
  ])("%s → regenerate (%j)", (_name, overrides, reason) => {
    expect(decideMode(facts(overrides))).toMatchObject({ mode: "regenerate", reason });
  });

  test("the lineage revision is the base; the candidate revision is the fallback", () => {
    expect(decideMode(facts({ candidateRevision: "d".repeat(40) }))).toEqual({ mode: "update", reason: "update", base: rev });
    expect(decideMode(facts({ previousLineage: null, candidateRevision: "d".repeat(40) }))).toEqual({
      mode: "update",
      reason: "update",
      base: "d".repeat(40),
    });
  });

  test("200 dirty paths and 4 updates still update", () => {
    expect(decideMode(facts({ previousLineage: lineage({ dirtyCount: 200, updatesSinceRegeneration: 4 }) })).mode).toBe("update");
  });
});
