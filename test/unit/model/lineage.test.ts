// FR-UPD-04 and FR-CMP-01: lineage.json round-trips and tolerates missing or malformed commit details.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { LINEAGE_FILE, readLineage, writeLineage, type Lineage } from "../../../src/model/lineage";
import { tempDir } from "../support/temp";

const rev = "c".repeat(40);
const m6 = {
  mode: "update",
  reason: "update",
  previousRun: "architecture-demo-20000101-000000",
  baseRevision: rev,
  revision: rev,
  dirty: ["notes.txt"],
  dirtyCount: 1,
  updatesSinceRegeneration: 1,
};

function lineageIn(value: unknown): Lineage | null {
  const dir = tempDir();
  writeFileSync(join(dir, LINEAGE_FILE), JSON.stringify(value));
  return readLineage(dir);
}

describe("FR-CMP-01 lineage commit details", () => {
  test("an M6 lineage without the fields reads with both null", () => {
    expect(lineageIn(m6)).toEqual({ ...m6, baseCommit: null, headCommit: null });
  });

  test("malformed commit values read as null without rejecting the lineage", () => {
    expect(lineageIn({ ...m6, baseCommit: "abc", headCommit: { subject: "s", committedAt: 3 } })).toMatchObject({ baseCommit: null, headCommit: null });
  });

  test("written commit details read back", () => {
    const dir = tempDir();
    const lineage = { ...m6, baseCommit: { subject: "Basis ✓", committedAt: "2026-10-01T10:00:00+08:00" }, headCommit: null } as Lineage;
    writeLineage(dir, lineage);
    expect(readLineage(dir)).toEqual(lineage);
  });

  test("a lineage with a wrong required field is still rejected", () => {
    expect(lineageIn({ ...m6, mode: "other" })).toBeNull();
  });
});
