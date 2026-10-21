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
  "src/vscode/sidebar/wording.ts": true,
  "src/core-node/changes.ts": true,
  "src/core-node/evidence.ts": true,
  "src/core/citationPath.ts": true,
  "src/core/deny.ts": true,
  "src/core-node/config.ts": true,
  "src/core-node/ownership.ts": true,
  "src/core-node/delta.ts": true,
  "src/core-node/deltaMarkdown.ts": true,
  "src/core/dates.ts": true,
  "src/core/gitFormat.ts": true,
};
const NODE_MODEL: Record<string, true> = {
  "src/core-node/citations.ts": true,
  "src/core-node/git.ts": true,
  "src/core-node/runFolder.ts": true,
  "src/core-node/discovery.ts": true,
  "src/core-node/lineage.ts": true,
  "src/model/session.ts": true,
  "src/core-node/confine.ts": true,
  "src/core-node/which.ts": true,
  "src/core-node/integrity.ts": true,
  "src/core-node/runRecord.ts": true,
  "src/core-node/preflight.ts": true,
  "src/vscode/maps.ts": true,
  "src/core-node/check.ts": true,
  "src/core-node/repoSize.ts": true,
  "src/core-node/fingerprints.ts": true,
  "src/core-node/staleness.ts": true,
  "src/core-node/jsonFile.ts": true,
  "src/core-node/hashTree.mts": true,
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
  const browserSafe = file.startsWith("src/viewer/layout/") || BROWSER_SAFE_MODEL[file] === true;
  for (const specifier of importSpecifiers(source)) {
    if (specifier === "vscode") {
      violations.push(`${file}: imports vscode`);
    } else if (isNodeBuiltin(specifier)) {
      if (browserSafe) violations.push(`${file}: browser-safe module imports ${specifier}`);
      else if (!NODE_MODEL[file]) violations.push(`${file}: imports ${specifier} outside the listed Node modules`);
      else if (!NODE_ALLOWED[specifier]) violations.push(`${file}: imports ${specifier}; only fs, path, child_process, crypto are allowed`);
    } else if (specifier.startsWith(".")) {
      const target = join(file, "..", specifier).split("\\").join("/");
      const model = ["src/model/", "src/core/", "src/core-node/", ...MOVED_FROM_MODEL.map((moved) => moved.replace(/\.ts$/, ""))];
      const allowedPrefixes = file.startsWith("src/viewer/layout/") ? ["src/viewer/layout/", ...model] : model;
      if (!allowedPrefixes.some((prefix) => target.startsWith(prefix))) {
        violations.push(`${file}: imports ${specifier} outside its allowed layers`);
      }
    }
  }
  return violations;
}

/** Files that came from src/model into another unit. This test keeps checking them. */
const MOVED_FROM_MODEL = [
  "src/viewer/protocol.ts",
  "src/vscode/agentStream/claude.ts",
  "src/vscode/agentStream/codex.ts",
  "src/vscode/agentStream/feed.ts",
  "src/vscode/agentStream/summary.ts",
  "src/vscode/agentStream/tracker.ts",
  "src/vscode/notesBlock.ts",
  "src/vscode/boxHotspots.ts",
  "src/vscode/usageCounts.ts",
  "src/vscode/ruleEdits.ts",
  "src/vscode/maps.ts",
  "src/vscode/sidebar/wording.ts",
  "src/vscode/sidebar/health.ts",
];

describe("NFR-QUAL-03 module boundaries", () => {
  test("src/model and src/layout respect the boundaries", () => {
    // skillFiles.ts came from src/extension, which this test does not scan.
    const files = [...sourceFiles("src/model"), ...sourceFiles("src/core"), ...sourceFiles("src/core-node"), ...sourceFiles("src/viewer/layout"), ...MOVED_FROM_MODEL].filter((file) => file !== "src/core-node/skillFiles.ts");
    const violations = files.flatMap((file) => boundaryViolations(file, readFileSync(join(repoRoot, file), "utf8")));
    expect(violations).toEqual([]);
  });

  test.each([
    ["src/viewer/layout/scene.ts", 'import * as vscode from "vscode";'],
    ["src/viewer/layout/scene.ts", 'import { readFileSync } from "node:fs";'],
    ["src/viewer/layout/scene.ts", 'import path from "path";'],
    ["src/core/types.ts", 'export { x } from "node:path";'],
    ["src/core/tolerant.ts", 'const fs = require("fs");'],
    ["src/core/schema.ts", 'import { readFileSync } from "node:fs";'],
    ["src/core-node/citations.ts", 'import { createServer } from "node:http";'],
    // Dynamic import on purpose: the scanner must also catch `import()` of a built-in.
    ["src/core/checks.ts", 'const m = await import("node:os");'],
    ["src/core-node/git.ts", 'import type { ExtensionContext } from "vscode";'],
    ["src/core/schema.ts", 'import { panel } from "../extension/panel";'],
    ["src/viewer/layout/elk.ts", 'import { render } from "../render";'],
  ])("%s rejects %s", (file, source) => {
    expect(boundaryViolations(file, source)).toHaveLength(1);
  });

  test.each([
    ["src/core-node/citations.ts", 'import { realpathSync } from "node:fs";'],
    ["src/core-node/git.ts", 'import { spawnSync } from "node:child_process";'],
    ["src/core/schema.ts", 'import Ajv2020 from "ajv/dist/2020";'],
    ["src/viewer/layout/elk.ts", 'import ELK from "elkjs/lib/elk.bundled.js";'],
    ["src/viewer/layout/elk.ts", 'import type { ArchifyDoc } from "../../core/types";'],
  ])("%s allows %s", (file, source) => {
    expect(boundaryViolations(file, source)).toEqual([]);
  });
});
