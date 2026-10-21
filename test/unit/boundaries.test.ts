// NFR-QUAL-03: src/model and src/layout stay free of `vscode`; the browser-safe modules
// (all of src/layout, model types/tolerant/checks/changeMap/matchIds/diagramDiff/comparison/
// runChanges) use no Node built-ins at all; only the listed model modules may touch the file
// system, paths or child processes.
import { builtinModules } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { importSpecifiers, repoRoot, sourceFiles } from "./support/sourceScan";

const BROWSER_SAFE_MODEL: Record<string, true> = {
  "src/core/types.ts": true,
  "src/core/tolerant.ts": true,
  "src/core/checks.ts": true,
  "src/core/changeMap.ts": true,
  "src/core/matchIds.ts": true,
  "src/core/diagramDiff.ts": true,
  "src/core/comparison.ts": true,
  "src/core/runChanges.ts": true,
  "src/model/home.ts": true,
  "src/model/changes.ts": true,
  "src/model/evidence.ts": true,
  "src/core/citationPath.ts": true,
  "src/core/deny.ts": true,
  "src/model/config.ts": true,
  "src/model/ownership.ts": true,
  "src/model/delta.ts": true,
  "src/model/deltaMarkdown.ts": true,
  "src/core/dates.ts": true,
  "src/core/gitFormat.ts": true,
};
const NODE_MODEL: Record<string, true> = {
  "src/model/citations.ts": true,
  "src/model/git.ts": true,
  "src/model/runFolder.ts": true,
  "src/model/discovery.ts": true,
  "src/model/lineage.ts": true,
  "src/model/session.ts": true,
  "src/model/confine.ts": true,
  "src/model/which.ts": true,
  "src/model/integrity.ts": true,
  "src/model/runRecord.ts": true,
  "src/model/preflight.ts": true,
  "src/model/maps.ts": true,
  "src/model/check.ts": true,
  "src/model/repoSize.ts": true,
  "src/model/fingerprints.ts": true,
  "src/model/staleness.ts": true,
  "src/model/jsonFile.ts": true,
  "src/model/hashTree.mts": true,
};
const NODE_ALLOWED: Record<string, true> = {
  "node:fs": true,
  "node:fs/promises": true,
  "node:path": true,
  "node:child_process": true,
  "node:crypto": true,
};

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier.split("/")[0]!);
}

/** Boundary violations for one file of src/model or src/layout. */
function boundaryViolations(file: string, source: string): string[] {
  const violations: string[] = [];
  const browserSafe = file.startsWith("src/layout/") || BROWSER_SAFE_MODEL[file] === true;
  for (const specifier of importSpecifiers(source)) {
    if (specifier === "vscode") {
      violations.push(`${file}: imports vscode`);
    } else if (isNodeBuiltin(specifier)) {
      if (browserSafe) violations.push(`${file}: browser-safe module imports ${specifier}`);
      else if (!NODE_MODEL[file]) violations.push(`${file}: imports ${specifier} outside the listed Node modules`);
      else if (!NODE_ALLOWED[specifier]) violations.push(`${file}: imports ${specifier}; only fs, path, child_process, crypto are allowed`);
    } else if (specifier.startsWith(".")) {
      const target = join(file, "..", specifier).split("\\").join("/");
      const allowedPrefixes = file.startsWith("src/layout/") ? ["src/layout/", "src/model/", "src/core/"] : ["src/model/", "src/core/"];
      if (!allowedPrefixes.some((prefix) => target.startsWith(prefix))) {
        violations.push(`${file}: imports ${specifier} outside its allowed layers`);
      }
    }
  }
  return violations;
}

describe("NFR-QUAL-03 module boundaries", () => {
  test("src/model and src/layout respect the boundaries", () => {
    const files = [...sourceFiles("src/model"), ...sourceFiles("src/core"), ...sourceFiles("src/layout")];
    const violations = files.flatMap((file) => boundaryViolations(file, readFileSync(join(repoRoot, file), "utf8")));
    expect(violations).toEqual([]);
  });

  test.each([
    ["src/layout/scene.ts", 'import * as vscode from "vscode";'],
    ["src/layout/scene.ts", 'import { readFileSync } from "node:fs";'],
    ["src/layout/scene.ts", 'import path from "path";'],
    ["src/core/types.ts", 'export { x } from "node:path";'],
    ["src/core/tolerant.ts", 'const fs = require("fs");'],
    ["src/core/schema.ts", 'import { readFileSync } from "node:fs";'],
    ["src/model/citations.ts", 'import { createServer } from "node:http";'],
    // Dynamic import on purpose: the scanner must also catch `import()` of a built-in.
    ["src/core/checks.ts", 'const m = await import("node:os");'],
    ["src/model/git.ts", 'import type { ExtensionContext } from "vscode";'],
    ["src/core/schema.ts", 'import { panel } from "../extension/panel";'],
    ["src/layout/elk.ts", 'import { render } from "../../webview/render";'],
  ])("%s rejects %s", (file, source) => {
    expect(boundaryViolations(file, source)).toHaveLength(1);
  });

  test.each([
    ["src/model/citations.ts", 'import { realpathSync } from "node:fs";'],
    ["src/model/git.ts", 'import { spawnSync } from "node:child_process";'],
    ["src/core/schema.ts", 'import Ajv2020 from "ajv/dist/2020";'],
    ["src/layout/elk.ts", 'import ELK from "elkjs/lib/elk.bundled.js";'],
    ["src/layout/elk.ts", 'import type { ArchifyDoc } from "../model/types";'],
  ])("%s allows %s", (file, source) => {
    expect(boundaryViolations(file, source)).toEqual([]);
  });
});
