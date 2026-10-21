// ENG-04: the notices generator names every bundled package and catches a stale file.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, test } from "vitest";
import { packagesOf } from "../../scripts/notices.mjs";
import { repoRoot } from "./support/sourceScan";
import { put, tempDir } from "./support/temp";

test("packagesOf names plain, scoped and nested packages once each, and skips own sources", () => {
  expect(
    packagesOf([
      "node_modules/ajv/dist/core.js",
      "node_modules/ajv/dist/compile/index.js",
      "node_modules/@scope/pkg/index.js",
      "node_modules/outer/node_modules/inner/lib.js",
      "src/model/schema.ts",
    ]),
  ).toEqual(["@scope/pkg", "ajv", "inner"]);
});

test("--check passes a fresh file and fails once a bundled package changes version", () => {
  const root = tempDir();
  put(root, "out/meta/bundles.json", JSON.stringify({ inputs: ["node_modules/demo/index.js"] }));
  put(root, "node_modules/demo/package.json", JSON.stringify({ name: "demo", version: "1.0.0", license: "MIT" }));
  put(root, "node_modules/demo/LICENSE", "Demo licence text");
  put(root, "THIRD_PARTY_NOTICES.md", "# Third-party notices\n\nKept by hand.\n");
  const script = join(repoRoot, "scripts/notices.mjs");
  const run = (mode: string) => spawnSync(process.execPath, [script, mode, "--root", root], { encoding: "utf8" });

  expect(run("--check").status).toBe(1);
  expect(run("--write").status).toBe(0);
  expect(run("--check").status).toBe(0);
  put(root, "node_modules/demo/package.json", JSON.stringify({ name: "demo", version: "1.0.1", license: "MIT" }));
  expect(run("--check").status).toBe(1);
});
