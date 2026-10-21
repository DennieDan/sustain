// NFR-QUAL-03, RFX-09: each folder under src/ is a unit, and a unit imports only the units, packages
// and Node built-ins spec-refactor §2 allows it. The entry points are imported by nothing, only
// src/vscode imports `vscode`, src/vscode reaches src/learn through extension.ts and src/vscode/learn,
// and the viewer names no VS Code API. The core typecheck sees ES2023 and no Node or DOM types.
import { spawnSync } from "node:child_process";
import { builtinModules } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, posix } from "node:path";
import { describe, expect, test } from "vitest";
import { importSpecifiers, repoRoot, sourceFiles } from "./support/sourceScan";

const UNITS = ["core", "core-node", "skills", "viewer", "cli", "action", "learn", "vscode"] as const;
type Unit = (typeof UNITS)[number];

/** The other units each unit may import. */
const MAY_IMPORT: Record<Unit, readonly Unit[]> = {
  core: [],
  "core-node": ["core"],
  skills: ["core", "core-node"],
  viewer: ["core"],
  cli: ["core", "core-node"],
  action: ["core", "core-node"],
  learn: ["core", "core-node", "viewer"],
  vscode: ["core", "core-node", "viewer", "learn"],
};

/** The npm packages each unit may import. The `vscode` module has a rule of its own. */
const PACKAGES: Record<Unit, readonly string[]> = {
  core: ["ajv"],
  "core-node": [],
  skills: [],
  viewer: ["elkjs"],
  cli: [],
  action: [],
  learn: [],
  vscode: [],
};

/** The units without Node built-ins. */
const NO_NODE: readonly Unit[] = ["core", "viewer"];

/** The units that are entry points of a bundle, which no other unit imports. */
const ENTRY_POINTS: readonly Unit[] = ["vscode", "cli", "action", "skills"];

/**
 * The bug-hunt files RFX-12 moves in RF4, with the folder each moves to. Until then the rules treat
 * each file as if it sat in that folder.
 */
const RF4_MOVES: Record<string, string> = {
  "src/model/session.ts": "src/learn/",
  "src/model/leaderboard.ts": "src/learn/",
  "src/agent/session.ts": "src/learn/",
  "src/agent/session-hook.ts": "src/learn/",
  "src/agent/modes/bugfix/mutations.ts": "src/learn/modes/bugfix/",
  "src/extension/hooksFiles.ts": "src/learn/",
  "src/extension/sessionAgents.ts": "src/learn/",
  "src/extension/sessionFiles.ts": "src/learn/",
  "webview/session.ts": "src/learn/webview/",
  "webview/session.css": "src/learn/webview/",
  "src/extension/learn.ts": "src/vscode/learn/",
  "src/extension/sessionPanel.ts": "src/vscode/learn/",
  "src/extension/sessionWatcher.ts": "src/vscode/learn/",
};

/**
 * The places where the tree breaks the rules until the feature named beside each removes them.
 * The real tree must break them in exactly these places.
 */
const PENDING = [
  // RFX-12: the bug-hunt agent launch leaves src/vscode's Devin module.
  "src/extension/sessionAgents.ts: imports ../vscode/devin from src/vscode, an entry point",
  // RFX-13: src/vscode reaches src/learn only through extension.ts.
  "src/vscode/generate.ts: imports ../extension/hooksFiles from src/learn outside extension.ts and src/vscode/learn/",
  "src/vscode/home.ts: imports ../extension/sessionFiles from src/learn outside extension.ts and src/vscode/learn/",
  "src/vscode/install.ts: imports ../extension/hooksFiles from src/learn outside extension.ts and src/vscode/learn/",
  "src/vscode/removeSustain.ts: imports ../extension/hooksFiles from src/learn outside extension.ts and src/vscode/learn/",
  "src/vscode/removeSustain.ts: imports ../model/session from src/learn outside extension.ts and src/vscode/learn/",
  // RFX-18: the viewer reaches VS Code through its host, and text measurement reads --sustain-font-family.
  "src/viewer/main.ts: names acquireVsCodeApi",
  "src/viewer/main.ts: names --vscode-",
  // RFX-19: the viewer styles itself with --sustain-* tokens.
  "src/viewer/styles.css: names --vscode-",
];

/** Where `path` sits for the rules: its RF4 folder for a bug-hunt file, else where it is. */
function rulePath(path: string): string {
  for (const candidate of [path, `${path}.ts`]) {
    const folder = RF4_MOVES[candidate];
    if (folder !== undefined) return folder + basename(candidate);
  }
  return path;
}

function unitOf(path: string): Unit | null {
  const name = /^src\/([^/]+)\//.exec(path)?.[1];
  return UNITS.find((unit) => unit === name) ?? null;
}

/** An npm package name with an optional path, as a bare import specifier is written. */
const PACKAGE_SPECIFIER = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w./-]*)?$/;

/** The package `specifier` names, or `null` for text the scanner took for an import, such as a template literal. */
function packageOf(specifier: string): string | null {
  if (!PACKAGE_SPECIFIER.test(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function isNodeBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || builtinModules.includes(specifier.split("/")[0]!);
}

/** The ways `file`, holding `source`, breaks the unit rules. */
function unitViolations(file: string, source: string): string[] {
  const path = rulePath(file);
  const unit = unitOf(path);
  if (unit === null) return [`${file}: sits in no unit`];
  const violations: string[] = [];
  if (unit === "viewer") {
    for (const name of ["acquireVsCodeApi", "--vscode-"]) if (source.includes(name)) violations.push(`${file}: names ${name}`);
  }
  for (const specifier of importSpecifiers(source)) {
    if (specifier.startsWith(".")) {
      const target = rulePath(posix.join(posix.dirname(file), specifier));
      const targetUnit = unitOf(target);
      if (targetUnit === unit) continue;
      if (targetUnit === null) violations.push(`${file}: imports ${specifier}, which sits in no unit`);
      else if (ENTRY_POINTS.includes(targetUnit)) violations.push(`${file}: imports ${specifier} from src/${targetUnit}, an entry point`);
      else if (!MAY_IMPORT[unit].includes(targetUnit)) violations.push(`${file}: imports ${specifier} from src/${targetUnit}, which src/${unit} may not import`);
      else if (targetUnit === "learn" && path !== "src/vscode/extension.ts" && !path.startsWith("src/vscode/learn/")) {
        violations.push(`${file}: imports ${specifier} from src/learn outside extension.ts and src/vscode/learn/`);
      }
    } else if (specifier === "vscode") {
      if (unit !== "vscode") violations.push(`${file}: imports vscode outside src/vscode`);
    } else if (isNodeBuiltin(specifier)) {
      if (NO_NODE.includes(unit)) violations.push(`${file}: imports ${specifier} into src/${unit}`);
    } else {
      const name = packageOf(specifier);
      if (name !== null && !PACKAGES[unit].includes(name)) violations.push(`${file}: imports ${specifier}, which src/${unit} may not import`);
    }
  }
  return violations;
}

describe("NFR-QUAL-03 RFX-09 unit boundaries", () => {
  test("RFX-09 every source file sits in a unit and breaks the rules only where a later feature fixes it", () => {
    const files = [...sourceFiles("src"), ...sourceFiles("webview"), ...sourceFiles("src", /\.css$/), ...sourceFiles("webview", /\.css$/)];
    const violations = files.flatMap((file) => unitViolations(file, readFileSync(join(repoRoot, file), "utf8")));
    expect(violations.sort()).toEqual([...PENDING].sort());
  });

  test.each([
    ["src/core/types.ts", 'import { readFileSync } from "node:fs";'],
    // Dynamic import and require on purpose: the scanner must also catch them.
    ["src/core/checks.ts", 'const m = await import("node:os");'],
    ["src/core/tolerant.ts", 'const fs = require("fs");'],
    ["src/core/types.ts", 'import { readJson } from "../core-node/jsonFile";'],
    ["src/core/types.ts", 'import ELK from "elkjs";'],
    ["src/core-node/git.ts", 'import { el } from "../viewer/dom";'],
    ["src/core-node/git.ts", 'import Ajv from "ajv";'],
    ["src/skills/validate.ts", 'import type { SessionView } from "../learn/protocol";'],
    ["src/skills/validate.ts", 'import { el } from "../viewer/dom";'],
    ["src/viewer/render.ts", 'import { readJson } from "../core-node/jsonFile";'],
    ["src/viewer/layout/scene.ts", 'import path from "path";'],
    ["src/cli/commands.ts", 'import type { SessionView } from "../learn/protocol";'],
    ["src/action/main.ts", 'import { el } from "../viewer/dom";'],
    ["src/learn/protocol.ts", 'import { webviewHtml } from "../vscode/html";'],
    ["src/model/x.ts", "export const x = 1;"],
    ["src/core/types.ts", 'import { x } from "../../scripts/x.mjs";'],
  ])("RFX-09 %s breaks the rules with %s", (file, source) => {
    expect(unitViolations(file, source)).toHaveLength(1);
  });

  test.each([
    ["src/core-node/git.ts", 'import type { ExtensionContext } from "vscode";'],
    ["src/learn/protocol.ts", 'import * as vscode from "vscode";'],
  ])("RFX-09 only src/vscode imports the vscode module: %s rejects %s", (file, source) => {
    expect(unitViolations(file, source)).toEqual([expect.stringContaining("imports vscode outside src/vscode")]);
  });

  test.each([
    ["src/core-node/check.ts", 'import { main } from "../cli/commands";'],
    ["src/learn/protocol.ts", 'import { runAction } from "../action/main";'],
    ["src/core-node/check.ts", 'import { main } from "../skills/validate";'],
    ["src/viewer/main.ts", 'import { webviewHtml } from "../vscode/html";'],
  ])("RFX-09 nothing imports an entry point: %s rejects %s", (file, source) => {
    expect(unitViolations(file, source)).toEqual([expect.stringContaining("an entry point")]);
  });

  test.each([
    ["src/vscode/home.ts", 'import type { SessionView } from "../learn/protocol";'],
    ["src/vscode/sidebar/home.ts", 'import type { SessionView } from "../../learn/protocol";'],
    ["src/vscode/install.ts", 'import { mergeHooks } from "../extension/hooksFiles";'],
  ])("RFX-09 inside src/vscode only extension.ts and src/vscode/learn import src/learn: %s rejects %s", (file, source) => {
    expect(unitViolations(file, source)).toEqual([expect.stringContaining("from src/learn outside extension.ts and src/vscode/learn/")]);
  });

  test.each([
    ["src/viewer/main.ts", "const vscode = acquireVsCodeApi();"],
    ["src/viewer/styles.css", ".box { fill: var(--vscode-editor-background); }"],
  ])("RFX-09 the viewer names no VS Code API: %s rejects %s", (file, source) => {
    expect(unitViolations(file, source)).toEqual([expect.stringContaining("names ")]);
  });

  test.each([
    ["src/core/schema.ts", 'import Ajv2020 from "ajv/dist/2020";'],
    ["src/core-node/git.ts", 'import { spawnSync } from "node:child_process";'],
    ["src/core-node/git.ts", 'import type { Repository } from "../core/types";'],
    ["src/viewer/layout/elk.ts", 'import ELK from "elkjs/lib/elk.bundled.js";'],
    ["src/viewer/layout/elk.ts", 'import type { ArchifyDoc } from "../../core/types";'],
    ["src/learn/protocol.ts", 'import { el } from "../viewer/dom";'],
    ["src/vscode/extension.ts", 'import type { SessionWebviewMessage } from "../learn/protocol";'],
    ["src/vscode/learn/sessionPanel.ts", 'import type { SessionView } from "../../learn/protocol";'],
    ["src/extension/sessionPanel.ts", 'import type { SessionView } from "../learn/protocol";'],
    ["src/vscode/sidebar/home.ts", 'import { button } from "../../viewer/dom";'],
    ["src/vscode/home.ts", 'import * as vscode from "vscode";'],
  ])("RFX-09 %s may hold %s", (file, source) => {
    expect(unitViolations(file, source)).toEqual([]);
  });

  test("RFX-09 the core typecheck rejects a Node import and a DOM global", () => {
    const dir = mkdtempSync(join(tmpdir(), "sustain-core-"));
    try {
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({ extends: join(repoRoot, "src/core/tsconfig.json"), include: ["*.ts"] }),
      );
      const typecheck = (source: string) => {
        writeFileSync(join(dir, "probe.ts"), source);
        return spawnSync(process.execPath, [join(repoRoot, "node_modules/typescript/bin/tsc"), "--noEmit", "-p", join(dir, "tsconfig.json")], { encoding: "utf8" });
      };
      expect(typecheck("export const sorted = [3, 1, 2].toSorted();\n").status).toBe(0);
      const node = typecheck('import { readFileSync } from "node:fs";\nexport const read = readFileSync;\n');
      expect(node.status).not.toBe(0);
      expect(node.stdout).toContain("node:fs");
      const dom = typecheck("export const title = document.title;\n");
      expect(dom.status).not.toBe(0);
      expect(dom.stdout).toContain("document");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
