// Builds the shipped bundles into dist/ (see docs/spec.md §6).
// `node esbuild.mjs`        → dist/
// `node esbuild.mjs --e2e`  → out/e2e/ (the @vscode/test-electron suite; never shipped)
// `node esbuild.mjs --action` → action/dist/index.js (the GitHub Action, committed; PRC-04)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  metafile: true,
};

/** The script entry points, emitted as `<name>.mjs`. @type {Record<string, string>} */
const SCRIPT_ENTRIES = {
  "repo-facts": "src/agent/repo-facts.ts",
  validate: "src/agent/validate.ts",
  "change-map": "src/agent/change-map.ts",
  "match-ids": "src/agent/match-ids.ts",
  session: "src/agent/session.ts",
  "session-hook": "src/agent/session-hook.ts",
};

/**
 * The skill scripts: ESM for Node ≥ 18 with every dependency inlined (ADR 0007).
 * @param {string} outdir
 * @param {string[]} [names] which entries to build; default all (used by the test setup,
 *   which stages every script side by side in out/test-scripts/)
 */
export async function buildScripts(outdir, names = Object.keys(SCRIPT_ENTRIES)) {
  return esbuild.build({
    ...common,
    entryPoints: Object.fromEntries(
      names.map((name) => {
        const entry = SCRIPT_ENTRIES[name];
        if (entry === undefined) throw new Error(`buildScripts: unknown script entry ${name}`);
        return [name, join(root, entry)];
      }),
    ),
    outdir,
    outExtension: { ".js": ".mjs" },
    platform: "node",
    format: "esm",
    target: "node18",
    define: {
      "process.env.SUSTAIN_VERSION": JSON.stringify(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version),
    },
  });
}

/**
 * Records every npm file the shipped bundles include in `out/meta/bundles.json`, the input of
 * `scripts/notices.mjs` (ENG-04).
 * @param {import("esbuild").Metafile[]} metafiles
 */
function writeBundleInputs(metafiles) {
  const inputs = new Set(metafiles.flatMap((meta) => Object.keys(meta.inputs)).filter((path) => path.includes("node_modules/")));
  mkdirSync(join(root, "out/meta"), { recursive: true });
  writeFileSync(join(root, "out/meta/bundles.json"), `${JSON.stringify({ inputs: [...inputs].sort() }, null, 2)}\n`);
}

/**
 * SHA-256 of every file below `dir`, keyed by `/`-separated relative path, with links marked
 * `link`. It matches `hashTree` in src/model/integrity.ts, and the e2e smoke test checks that.
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Record<string, string>}
 */
function hashTree(dir, prefix = "") {
  /** @type {Record<string, string>} */
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const key = prefix === "" ? name : `${prefix}/${name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) out[key] = "link";
    else if (stat.isDirectory()) Object.assign(out, hashTree(path, key));
    else out[key] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return out;
}

/**
 * Writes `<out>/skill-hashes.json`, the reference for the skill integrity check (SAF-01).
 * @param {string} out
 */
function writeSkillHashes(out) {
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const skillsDir = join(out, "skills");
  const skills = Object.fromEntries(readdirSync(skillsDir).sort().map((name) => [name, hashTree(join(skillsDir, name))]));
  writeFileSync(join(out, "skill-hashes.json"), `${JSON.stringify({ version, skills }, null, 2)}\n`);
}

/**
 * The skills with their scripts, their hashes, and the core CLI that installs and checks them
 * (RCH-03), which finds the skills beside itself. The tests build this alone.
 * @param {string} out
 */
export async function buildSkillsAndCli(out) {
  /** @type {import("esbuild").BuildResult[]} */
  const results = [];
  // Static skill files (SKILL.md, agents/, references/) ship as-is.
  cpSync(join(root, "skills"), join(out, "skills"), { recursive: true });
  results.push(await buildScripts(join(out, "skills/sustain-architecture/scripts"), ["repo-facts", "validate", "change-map", "match-ids"]));
  results.push(await buildScripts(join(out, "skills/sustain-bugfix/scripts"), ["session", "session-hook"]));
  writeSkillHashes(out);
  results.push(
    await esbuild.build({
      ...common,
      entryPoints: [join(root, "src/cli/sustain.ts")],
      outfile: join(out, "cli/sustain.mjs"),
      platform: "node",
      format: "esm",
      target: "node18",
      define: {
        "process.env.SUSTAIN_VERSION": JSON.stringify(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version),
      },
    }),
  );
  return results;
}

/**
 * Copies the built scripts back into skills/, so the committed skills work as they are for
 * `npx skills add` (RCH-02). CI fails when these are stale.
 * @param {string} out
 */
function syncCommittedSkills(out) {
  for (const name of readdirSync(join(out, "skills"))) {
    const built = join(out, "skills", name, "scripts");
    if (!existsSync(built)) continue;
    rmSync(join(root, "skills", name, "scripts"), { recursive: true, force: true });
    cpSync(built, join(root, "skills", name, "scripts"), { recursive: true });
  }
}

async function buildDist() {
  rmSync(dist, { recursive: true, force: true });
  /** @type {import("esbuild").BuildResult[]} */
  const results = [];

  results.push(...(await buildSkillsAndCli(dist)));
  syncCommittedSkills(dist);

  results.push(await esbuild.build({
    ...common,
    entryPoints: [join(root, "src/extension/extension.ts")],
    outfile: join(dist, "extension.js"),
    platform: "node",
    format: "cjs",
    target: "node20",
    external: ["vscode"],
  }));

  // The webviews: one IIFE each loaded by nonce under a strict CSP (NFR-SEC-01). The diagram one
  // carries elkjs inside its layout worker's code (VWR-02).
  results.push(await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/main.ts")],
    outfile: join(dist, "webview.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  }));
  results.push(await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/session.ts")],
    outfile: join(dist, "session-webview.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  }));
  results.push(await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/sidebar.ts")],
    outfile: join(dist, "sidebar.js"),
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
  }));
  cpSync(join(root, "webview/styles.css"), join(dist, "webview.css"));
  cpSync(join(root, "webview/session.css"), join(dist, "session-webview.css"));
  cpSync(join(root, "webview/sidebar.css"), join(dist, "sidebar.css"));
  writeBundleInputs(results.flatMap((result) => (result.metafile ? [result.metafile] : [])));
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

/**
 * The GitHub Action's bundle (PRC-04). It is committed, so it must come out the same on every machine.
 * @param {string} [outfile]
 */
export async function buildAction(outfile = join(root, "action/dist/index.js")) {
  await esbuild.build({
    ...common,
    metafile: false,
    entryPoints: [join(root, "action/src/index.ts")],
    outfile,
    platform: "node",
    format: "cjs",
    target: "node24",
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--e2e")) await buildE2e();
  else if (process.argv.includes("--action")) await buildAction();
  else await buildDist();
}
