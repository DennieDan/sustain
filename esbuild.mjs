// Builds the shipped bundles into dist/ (see docs/spec.md §6).
// `node esbuild.mjs`        → dist/
// `node esbuild.mjs --e2e`  → out/e2e/ (the @vscode/test-electron suite; never shipped)
import * as esbuild from "esbuild";
import { cpSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");

/** @type {import("esbuild").BuildOptions} */
const common = {
  bundle: true,
  logLevel: "warning",
  sourcemap: false,
  legalComments: "inline",
};

/**
 * The skill scripts: ESM for Node ≥ 18 with every dependency inlined (ADR 0007).
 * @param {string} outdir
 */
export async function buildScripts(outdir) {
  await esbuild.build({
    ...common,
    entryPoints: {
      "repo-facts": join(root, "src/agent/repo-facts.ts"),
      validate: join(root, "src/agent/validate.ts"),
      "change-map": join(root, "src/agent/change-map.ts"),
      "match-ids": join(root, "src/agent/match-ids.ts"),
    },
    outdir,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    format: "esm",
    target: "node18",
  });
}

async function buildDist() {
  rmSync(dist, { recursive: true, force: true });

  // Static skill files (SKILL.md, agents/, references/) ship as-is.
  cpSync(join(root, "skills"), join(dist, "skills"), { recursive: true });
  await buildScripts(join(dist, "skills/sustain-architecture/scripts"));

  await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/extension/extension.ts")],
    outfile: join(dist, "extension.js"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
  });

  // The webview: one IIFE (elkjs included) loaded by nonce under a strict CSP (NFR-SEC-01).
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/main.ts")],
    outfile: join(dist, "webview.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  });
  cpSync(join(root, "webview/styles.css"), join(dist, "webview.css"));
}

async function buildE2e() {
  const out = join(root, "out/e2e");
  rmSync(out, { recursive: true, force: true });
  const suiteDir = join(root, "test/e2e/suite");
  const suiteFiles = readdirSync(suiteDir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(suiteDir, name));
  await esbuild.build({
    ...common,
    entryPoints: [join(root, "test/e2e/runTest.ts"), ...suiteFiles],
    outdir: out,
    outbase: join(root, "test/e2e"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode", "mocha", "@vscode/test-electron"],
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--e2e")) await buildE2e();
  else await buildDist();
}
