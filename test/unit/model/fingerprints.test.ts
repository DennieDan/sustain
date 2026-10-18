// FRS-01: fingerprints hash each cited file as git does and each cited range after normalizing.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fingerprint, gitBlobId, hashLines, normalizedLines } from "../../../src/model/fingerprints";
import type { ArchifyDoc } from "../../../src/model/types";
import { git, put, tempDir } from "../support/temp";

test("FRS-01 blob equals git hash-object --no-filters, whatever the line endings or bytes", () => {
  const root = tempDir();
  git(root, "init", "-q");
  // Line-ending conversion would change the id if filters ran.
  writeFileSync(join(root, ".gitattributes"), "* text=auto eol=lf\n");
  const files: Record<string, Uint8Array> = {
    "crlf.txt": Buffer.from("a\r\nb\r\n"),
    "empty.txt": Buffer.alloc(0),
    "utf8.txt": Buffer.from("naïve — ok\n"),
    "bytes.bin": Uint8Array.from([0, 255, 10, 13, 0]),
  };
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(root, name), bytes);
    expect(gitBlobId(bytes), name).toBe(git(root, "hash-object", "--no-filters", name).trim());
  }
});

test("FRS-01 a range hash ignores \\r and trailing whitespace; a whole-file citation has none", () => {
  const root = tempDir();
  put(root, "lf.ts", "one\ntwo  \nthree\n");
  put(root, "crlf.ts", "one\r\ntwo\r\nthree\r\n");
  const doc = {
    components: [
      { id: "a", sources: [{ path: "lf.ts", line: 2, end_line: 3 }, { path: "lf.ts" }] },
      { id: "b", sources: [{ path: "crlf.ts", line: 2, end_line: 3 }] },
    ],
  } as unknown as ArchifyDoc;
  const prints = fingerprint(doc, root, "abc", new Date("2026-10-18T12:00:00Z"));
  expect(prints).toMatchObject({ schema: 1, revision: "abc", createdAt: "2026-10-18T12:00:00.000Z" });
  const [ranged, whole, crlf] = prints.citations;
  expect(ranged).toMatchObject({ component: "a", index: 0, path: "lf.ts", line: 2, end_line: 3, range: hashLines(["two", "three"]) });
  expect(crlf!.range).toBe(ranged!.range);
  expect(crlf!.blob).not.toBe(ranged!.blob);
  expect(whole).toEqual({ component: "a", index: 1, path: "lf.ts", blob: ranged!.blob });
  expect(normalizedLines("x \r\ny")).toEqual(["x", "y"]);
});
