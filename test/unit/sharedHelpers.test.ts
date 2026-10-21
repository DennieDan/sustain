// RFX-04: each shared helper has one definition in the sources and the build script.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot, sourceFiles } from "./support/sourceScan";

const FILES = [...sourceFiles("src"), ...sourceFiles("webview"), "esbuild.mjs"];
const SOURCES = FILES.map((file) => ({ file, source: readFileSync(join(repoRoot, file), "utf8") }));

/** The files that define `name`, once per definition: a function with a body, or a `const`, `let` or `var`. */
function definitions(name: string): string[] {
  const pattern = new RegExp(`\\bfunction\\s+${name}\\s*(?:<[^>]*>)?\\s*\\([^)]*\\)[^;{]*\\{|\\b(?:const|let|var)\\s+${name}\\s*[:=]`, "g");
  return SOURCES.flatMap(({ file, source }) => [...source.matchAll(pattern)].map(() => file));
}

/** The files where `pattern` matches, once per match. */
function matches(pattern: RegExp): string[] {
  return SOURCES.flatMap(({ file, source }) => [...source.matchAll(pattern)].map(() => file));
}

describe("RFX-04 one copy of each shared helper", () => {
  test.each(["isRecord", "readJson", "writeJson", "writeAtomic", "hashTree", "relativeAge", "isWithin", "probeFile"])("%s has exactly one definition", (name) => {
    expect(definitions(name)).toHaveLength(1);
  });

  test.each(["relativeDate", "repoFile", "looseRel"])("%s, which a shared helper replaced, has no definition", (name) => {
    expect(definitions(name)).toEqual([]);
  });

  test("one expression tells a plain object from null and arrays", () => {
    expect(matches(/typeof (\w+) === "object" && \1 !== null && !Array\.isArray\(\1\)/g)).toEqual(["src/core/types.ts"]);
  });

  test("one write renames a temp file over its target", () => {
    expect(matches(/\brenameSync\(/g)).toEqual(["src/core-node/jsonFile.ts"]);
  });
});
