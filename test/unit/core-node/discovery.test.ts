// FR-VIEW-02: newest candidate ordering over mixed folder names and modification times.
import { mkdirSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { listCandidates, repoRootFor } from "../../../src/core-node/discovery";
import { put, tempDir } from "../support/temp";

function candidate(root: string, folder: string, mtimeSeconds: number): void {
  const file = put(root, `.archify/${folder}/candidate.sir`, "{}");
  utimesSync(file, mtimeSeconds, mtimeSeconds);
}

describe("FR-VIEW-02 newest candidate", () => {
  test("run folders sort by timestamp then -N; other folders follow by mtime", () => {
    const root = tempDir();
    candidate(root, "architecture-old-20250101-000000", 5_000);
    candidate(root, "architecture-new-20261010-120000", 1_000);
    candidate(root, "architecture-new-20261010-120000-2", 1_000);
    candidate(root, "architecture-new-20261010-120000-10", 900);
    candidate(root, "architecture-mid-20260601-080000", 9_000);
    candidate(root, "hand-made", 8_000);
    candidate(root, "imported", 9_500);
    candidate(root, "architecture-no-timestamp", 7_000);
    expect(listCandidates(root).map((c) => c.runFolder)).toEqual([
      "architecture-new-20261010-120000-10",
      "architecture-new-20261010-120000-2",
      "architecture-new-20261010-120000",
      "architecture-mid-20260601-080000",
      "architecture-old-20250101-000000",
      "imported",
      "hand-made",
      "architecture-no-timestamp",
    ]);
  });

  test("folders without candidate.sir, stray files and links outside the root are ignored", () => {
    const base = tempDir();
    const root = join(base, "repo");
    candidate(root, "architecture-kept-20260101-000000", 1_000);
    put(root, ".archify/architecture-failed-20270101-000000/draft.json", "{}");
    put(root, ".archify/stray.json", "{}");
    mkdirSync(join(root, ".archify/architecture-dir-20280101-000000/candidate.sir"), { recursive: true });
    put(base, "outside/candidate.sir", "{}");
    symlinkSync(join(base, "outside"), join(root, ".archify/architecture-linked-20990101-000000"));
    const entries = listCandidates(root);
    expect(entries.map((c) => c.runFolder)).toEqual(["architecture-kept-20260101-000000"]);
    expect(entries[0]!.file).toBe(join(root, ".archify/architecture-kept-20260101-000000/candidate.sir"));
  });

  test("no .archify folder gives an empty list", () => {
    expect(listCandidates(tempDir())).toEqual([]);
  });
});

describe("FR-VIEW-01 repo root of a browsed file", () => {
  test.each([
    ["/w/repo/.archify/architecture-x-20260101-000000/candidate.sir", "/w/repo"],
    ["/w/repo/.archify/hand-made/other.json", "/w/repo"],
    ["/w/other/.archify/run/candidate.sir", "/w/other"],
    ["/w/repo/docs/diagram.json", "/w/folder"],
    ["/w/repo/.archify/candidate.sir", "/w/folder"],
  ])("%s → %s", (file, expected) => {
    expect(repoRootFor(file, "/w/folder")).toBe(expected);
  });
});