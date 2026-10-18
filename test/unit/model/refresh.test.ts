// FRS-05 and FRS-06: --paths globs, and the arguments Refresh passes to the refresh skill.
import { expect, test } from "vitest";
import { globToRegExp, inScope, refreshArgs } from "../../../src/model/refresh";

test("FRS-05 ** crosses folders, * and ? stay in one, and a folder matches what is below it", () => {
  const globs = ["src/**/*.ts", "lib", "docs/?.md"].map(globToRegExp);
  expect(["src/a.ts", "src/deep/b.ts", "lib/x/y.js", "docs/a.md"].filter((path) => inScope(path, globs))).toHaveLength(4);
  expect(["src/a.js", "library/x", "docs/ab.md", "x/src/a.ts"].filter((path) => inScope(path, globs))).toEqual([]);
  expect(inScope("anything", [])).toBe(true);
});

test("FRS-06 Refresh names the run, and a box's files after --paths, quoting spaces and leaving out shell characters", () => {
  expect(refreshArgs("architecture-app-20261018-120000")).toBe("--from architecture-app-20261018-120000");
  expect(refreshArgs("architecture-app-20261018-120000", ["src/a.ts", "docs/my notes.md", "bad$(x).ts", 'q".ts'])).toBe(
    '--from architecture-app-20261018-120000 --paths src/a.ts "docs/my notes.md"',
  );
});
