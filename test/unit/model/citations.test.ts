// FR-VAL-05: citation checks against a temp repo exercising every rule (ported cases from the
// prototype's model/tests/citations.rs, repo/tests/citations.rs and repo/tests/text.rs).
import { symlinkSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { checkCitations, citationPathOk, countLines, MAX_CITED_BYTES } from "../../../src/model/citations";
import type { ArchifyDoc, SourceRef } from "../../../src/model/types";
import { put, tempDir } from "../support/temp";

function doc(sources: SourceRef[]): ArchifyDoc {
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title: "T", output: "out/t.html" },
    components: [{ id: "a", type: "backend", label: "A", sources }],
  };
}

/** A repo with ordinary, empty, binary, large and linked files plus an outside folder. */
function repo(): string {
  const base = tempDir();
  const root = `${base}/repo`;
  put(root, "src/a.ts", "1\n2\n3\n4\n5\n");
  put(root, "src/no-newline.ts", "1\n2");
  put(root, "src/empty.ts", "");
  put(root, "config/.env", "TOKEN=1\n");
  put(root, "logo.png", Buffer.from([0x89, 0x50, 0x00, 0x47]));
  put(root, "late-nul.txt", Buffer.concat([Buffer.alloc(8 * 1024, 0x61), Buffer.from([0x00])]));
  put(root, "exact.txt", Buffer.alloc(MAX_CITED_BYTES, 0x61));
  put(root, "big.txt", Buffer.alloc(MAX_CITED_BYTES + 1, 0x61));
  put(base, "outside/secret.txt", "s\n");
  symlinkSync(`${base}/outside/secret.txt`, `${root}/leak.txt`);
  symlinkSync(`${base}/outside`, `${root}/outdir`);
  symlinkSync(`${root}/src/a.ts`, `${root}/alias.ts`);
  return root;
}

function one(root: string, source: SourceRef): { code: string; pointer: string; message: string }[] {
  return checkCitations(doc([source]), root);
}

describe("FR-VAL-05 path syntax", () => {
  test.each(["a", "src/a.ts", "a/b/c.d", ".env.example", "dir/.hidden", "a..b/c", "x".repeat(240)])("%s is accepted", (path) => {
    expect(citationPathOk(path)).toBe(true);
  });

  test.each(["", "/etc/passwd", "C:/x", "c:\\x", "src\\a.ts", "../a", "a/../b", "a/..", "./a", "a/./b", "a//b", "a/", "a\0b", "x".repeat(241)])(
    "%j is rejected",
    (path) => {
      expect(citationPathOk(path)).toBe(false);
    },
  );

  test("an invalid path is InvalidCitationPath at …/path and is not resolved", () => {
    const root = repo();
    expect(one(root, { path: "../repo/src/a.ts" })).toEqual([
      expect.objectContaining({ code: "InvalidCitationPath", pointer: "/components/0/sources/0/path" }),
    ]);
  });
});

describe("FR-VAL-05 line counting", () => {
  test.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\n\n", 2],
    ["a\r\nb\r\n", 2],
  ])("%j has %i lines", (text, count) => {
    expect(countLines(Buffer.from(text))).toBe(count);
  });
});

describe("FR-VAL-05 citations against a temp repo", () => {
  test("valid citations, including an in-root symlink, have no issues", () => {
    const root = repo();
    const sources: SourceRef[] = [
      { path: "src/a.ts", line: 1, end_line: 5 },
      { path: "src/no-newline.ts", line: 2 },
      { path: "alias.ts", line: 5 },
    ];
    expect(checkCitations(doc(sources), root)).toEqual([]);
    expect(one(root, { path: "src/empty.ts" })).toEqual([]);
    expect(one(root, { path: "exact.txt", line: 1 })).toEqual([]);
    expect(one(root, { path: "late-nul.txt" })).toEqual([]);
  });

  test.each([[".env"], ["config/.env"], ["certs/server.PEM"], [".git/HEAD"], [".archify/x/candidate.json"]])(
    "%s is DeniedCitation",
    (path) => {
      expect(one(repo(), { path })).toEqual([expect.objectContaining({ code: "DeniedCitation", pointer: "/components/0/sources/0/path" })]);
    },
  );

  test.each([
    ["leak.txt", "resolves outside the repository root"],
    ["outdir/secret.txt", "resolves outside the repository root"],
    ["src/missing.ts", "does not exist"],
    ["src/a.ts/child", "does not exist"],
    ["src", "is not a regular file"],
    ["big.txt", "too large"],
    ["logo.png", "binary"],
  ])("%s is BrokenCitation (%s)", (path, reason) => {
    const issues = one(repo(), { path });
    expect(issues).toEqual([expect.objectContaining({ code: "BrokenCitation", pointer: "/components/0/sources/0/path" })]);
    expect(issues[0]!.message).toContain(reason);
  });

  test.each<[SourceRef, string]>([
    [{ path: "src/a.ts", line: 0 }, "line"],
    [{ path: "src/a.ts", line: 6 }, "line"],
    [{ path: "src/a.ts", line: 6, end_line: 7 }, "line"],
    [{ path: "src/a.ts", end_line: 3 }, "end_line"],
    [{ path: "src/a.ts", line: 4, end_line: 3 }, "end_line"],
    [{ path: "src/a.ts", line: 2, end_line: 6 }, "end_line"],
    [{ path: "src/empty.ts", line: 1 }, "line"],
  ])("%j is BrokenCitation at …/%s with the line count", (source, field) => {
    const issues = one(repo(), source);
    expect(issues).toEqual([expect.objectContaining({ code: "BrokenCitation", pointer: `/components/0/sources/0/${field}` })]);
    expect(issues[0]!.message).toMatch(source.path === "src/empty.ts" ? /0 lines/ : /5 lines/);
  });

  test("pointers name the component and source index", () => {
    const root = repo();
    const d: ArchifyDoc = {
      ...doc([{ path: "src/a.ts" }]),
      components: [
        { id: "a", type: "backend", label: "A", sources: [{ path: "src/a.ts" }] },
        { id: "b", type: "backend", label: "B", sources: [{ path: "src/a.ts" }, { path: "src/missing.ts" }] },
      ],
    };
    expect(checkCitations(d, root).map((issue) => issue.pointer)).toEqual(["/components/1/sources/1/path"]);
  });
});
