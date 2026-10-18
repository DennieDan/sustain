// FRS-02: each citation is fresh, moved, edited, missing or unknown, and a box takes its worst.
import { renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { fingerprint } from "../../../src/model/fingerprints";
import { renamesSince } from "../../../src/model/git";
import { fileReader, mapFreshness } from "../../../src/model/staleness";
import type { ArchifyDoc } from "../../../src/model/types";
import { git, gitRepo, put, tempDir } from "../support/temp";

const SOURCE = ["import x from 'x';", "", "export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

/** A map citing `handle` (lines 3–6) in src/a.ts and the whole of src/b.ts. */
const DOC = {
  components: [
    { id: "api", sources: [{ path: "src/a.ts", line: 3, end_line: 6 }] },
    { id: "docs", sources: [{ path: "src/b.ts" }] },
    { id: "both", sources: [{ path: "src/b.ts" }, { path: "src/a.ts", line: 3, end_line: 6 }] },
  ],
} as unknown as ArchifyDoc;

function mapped(root: string): ReturnType<typeof fingerprint> {
  return fingerprint(DOC, root, null);
}

function stateNow(root: string, prints: ReturnType<typeof fingerprint>, renames = new Map<string, string>()) {
  return mapFreshness(prints, fileReader(root), renames);
}

function setup(): { root: string; prints: ReturnType<typeof fingerprint> } {
  const root = tempDir();
  put(root, "src/a.ts", SOURCE);
  put(root, "src/b.ts", "notes\n");
  return { root, prints: mapped(root) };
}

describe("FRS-02 staleness", () => {
  test("unchanged code is fresh", () => {
    const { root, prints } = setup();
    expect(stateNow(root, prints).boxes).toEqual({ api: "fresh", docs: "fresh", both: "fresh" });
  });

  test("CRLF line endings and trailing whitespace leave a range fresh", () => {
    const { root, prints } = setup();
    put(root, "src/a.ts", SOURCE.split("\n").map((line) => `${line}   `).join("\r\n"));
    expect(stateNow(root, prints).boxes["api"]).toBe("fresh");
  });

  test("lines added above move the block, and the new lines are given", () => {
    const { root, prints } = setup();
    put(root, "src/a.ts", `// one\n// two\n${SOURCE}`);
    const state = stateNow(root, prints);
    expect(state.boxes["api"]).toBe("moved");
    expect(state.citations[0]!.now).toEqual({ path: "src/a.ts", line: 5, end_line: 8 });
  });

  test("an indentation change counts as moved", () => {
    const { root, prints } = setup();
    put(root, "src/a.ts", SOURCE.split("\n").map((line) => (line === "" ? line : `  ${line}`)).join("\n"));
    expect(stateNow(root, prints).citations[0]).toMatchObject({ state: "moved", now: { path: "src/a.ts", line: 3, end_line: 6 } });
  });

  test("a duplicated block resolves to the copy nearest the old lines, not the first", () => {
    const root = tempDir();
    const block = SOURCE.split("\n").slice(2, 6).join("\n");
    put(root, "src/deep.ts", `${"// pad\n".repeat(30)}${block}\n`);
    const doc = { components: [{ id: "deep", sources: [{ path: "src/deep.ts", line: 31, end_line: 34 }] }] } as unknown as ArchifyDoc;
    const prints = fingerprint(doc, root, null);
    put(root, "src/deep.ts", `${block}\n${"// pad\n".repeat(30)}// one more\n${block}\n`);
    expect(stateNow(root, prints).citations[0]!.now).toEqual({ path: "src/deep.ts", line: 36, end_line: 39 });
  });

  test("a changed block is edited, a changed whole file is edited, and a deleted file is missing", () => {
    const { root, prints } = setup();
    put(root, "src/a.ts", SOURCE.replace("save(body)", "store(body)"));
    put(root, "src/b.ts", "other notes\n");
    expect(stateNow(root, prints).boxes).toMatchObject({ api: "edited", docs: "edited" });
    rmSync(join(root, "src/b.ts"));
    expect(stateNow(root, prints).boxes).toEqual({ api: "edited", docs: "missing", both: "missing" });
  });

  test("a box takes its worst citation", () => {
    const { root, prints } = setup();
    put(root, "src/a.ts", `// one\n${SOURCE}`);
    expect(stateNow(root, prints).boxes).toEqual({ api: "moved", docs: "fresh", both: "moved" });
  });

  test("without fingerprints nothing is known", () => {
    expect(mapFreshness(null, fileReader(tempDir()), new Map())).toEqual({ revision: null, createdAt: null, citations: [], boxes: {} });
  });

  test("a rename found by git diff -M --name-status leads to the block in the new file", () => {
    const root = gitRepo({ "src/a.ts": SOURCE, "src/b.ts": "notes\n" });
    const revision = git(root, "rev-parse", "HEAD").trim();
    const prints = mapped(root);
    git(root, "mv", "src/a.ts", "src/handler.ts");
    writeFileSync(join(root, "src/handler.ts"), `// moved here\n${SOURCE}`);
    const renames = renamesSince(root, revision);
    expect([...renames]).toEqual([["src/a.ts", "src/handler.ts"]]);
    expect(stateNow(root, prints, renames).citations[0]).toMatchObject({ state: "moved", now: { path: "src/handler.ts", line: 4, end_line: 7 } });
  });

  test("a file renamed outside git, with no rename recorded, is missing", () => {
    const { root, prints } = setup();
    renameSync(join(root, "src/a.ts"), join(root, "src/c.ts"));
    expect(stateNow(root, prints).boxes["api"]).toBe("missing");
  });
});
