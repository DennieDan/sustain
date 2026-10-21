// FR-CMP-02: changes.json built from a change map, parsed tolerantly, and read/written in a run folder.
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { ChangeMap, FileDiff } from "../../../src/core/changeMap";
import { CHANGES_FILE, readRunChanges, writeRunChanges } from "../../../src/core-node/lineage";
import { buildRunChanges, parseRunChanges, type RunChanges } from "../../../src/core/runChanges";
import { tempDir } from "../support/temp";

const base = "a".repeat(40);
const head = "b".repeat(40);
const diff = (oldPath: string | null, newPath: string | null): FileDiff => ({ oldPath, newPath, text: "", hunks: [] });

const sample: RunChanges = {
  baseRevision: base,
  revision: head,
  touchedComponents: [{ id: "api", files: [{ status: "M", path: "src/api.ts" }] }],
  uncited: [{ status: "R", path: "new.txt", oldPath: "old.txt" }],
};

describe("FR-CMP-02 buildRunChanges", () => {
  test("file statuses follow the diffs and name-status entries; order is kept", () => {
    const map: ChangeMap = {
      touchedComponents: [
        { id: "web", label: "Web", diffs: [diff(null, "src/new.ts"), diff("src/gone.ts", null), diff("src/web.ts", "src/front.ts"), diff("src/a.ts", "src/a.ts")] },
        { id: "api", label: "API", diffs: [diff("src/api.ts", "src/api.ts")] },
      ],
      untouched: [{ id: "db", label: "DB" }],
      uncited: [
        { status: "R087", path: "n.txt", oldPath: "o.txt" },
        { status: "C100", path: "copy.txt", oldPath: "orig.txt" },
        { status: "A", path: "add.txt" },
        { status: "D", path: "del.txt" },
        { status: "M", path: "mod.txt" },
        { status: "T", path: "type.txt" },
      ],
    };
    expect(buildRunChanges(map, base, null)).toEqual({
      baseRevision: base,
      revision: null,
      touchedComponents: [
        {
          id: "web",
          files: [
            { status: "A", path: "src/new.ts" },
            { status: "D", path: "src/gone.ts" },
            { status: "R", path: "src/front.ts", oldPath: "src/web.ts" },
            { status: "M", path: "src/a.ts" },
          ],
        },
        { id: "api", files: [{ status: "M", path: "src/api.ts" }] },
      ],
      uncited: [
        { status: "R", path: "n.txt", oldPath: "o.txt" },
        { status: "A", path: "copy.txt" },
        { status: "A", path: "add.txt" },
        { status: "D", path: "del.txt" },
        { status: "M", path: "mod.txt" },
        { status: "M", path: "type.txt" },
      ],
    });
  });
});

describe("FR-CMP-02 parseRunChanges", () => {
  test("a well-formed value round-trips", () => {
    expect(parseRunChanges(JSON.parse(JSON.stringify(sample)))).toEqual(sample);
  });

  test.each([
    ["not an object", [1]],
    ["null", null],
    ["missing baseRevision", { ...sample, baseRevision: undefined }],
    ["numeric revision", { ...sample, revision: 1 }],
    ["touchedComponents not an array", { ...sample, touchedComponents: {} }],
    ["uncited missing", { ...sample, uncited: undefined }],
  ])("wrong top-level shape (%s) → null", (_name, value) => {
    expect(parseRunChanges(value)).toBeNull();
  });

  test("malformed file entries and components are skipped; oldPath is kept only for R", () => {
    const value = {
      baseRevision: base,
      revision: null,
      touchedComponents: [
        { id: "api", files: [{ status: "M", path: "a.ts", oldPath: "x.ts" }, { status: "X", path: "b.ts" }, { status: "R", path: "c.ts" }, "d.ts", { status: "A", path: "" }] },
        { id: 3, files: [] },
        { id: "web" },
        null,
        { id: "db", files: [] },
      ],
      uncited: [{ status: "D", path: "gone.ts" }, { status: "R", path: "n.ts", oldPath: "o.ts" }, { path: "no-status.ts" }],
    };
    expect(parseRunChanges(value)).toEqual({
      baseRevision: base,
      revision: null,
      touchedComponents: [
        { id: "api", files: [{ status: "M", path: "a.ts" }] },
        { id: "db", files: [] },
      ],
      uncited: [
        { status: "D", path: "gone.ts" },
        { status: "R", path: "n.ts", oldPath: "o.ts" },
      ],
    });
  });
});

describe("FR-CMP-02 changes.json file", () => {
  test("written as 2-space JSON and read back", () => {
    const dir = tempDir();
    writeRunChanges(dir, sample);
    expect(readFileSync(`${dir}/${CHANGES_FILE}`, "utf8")).toBe(`${JSON.stringify(sample, null, 2)}\n`);
    expect(readRunChanges(dir)).toEqual(sample);
  });

  test("missing, unparseable or malformed → null", () => {
    const dir = tempDir();
    expect(readRunChanges(dir)).toBeNull();
    writeFileSync(`${dir}/${CHANGES_FILE}`, "{not json");
    expect(readRunChanges(dir)).toBeNull();
    writeFileSync(`${dir}/${CHANGES_FILE}`, JSON.stringify({ baseRevision: base }));
    expect(readRunChanges(dir)).toBeNull();
  });
});
