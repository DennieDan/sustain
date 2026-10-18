// Builds the shipped bundles into dist/ (see docs/spec.md §6).
// `node esbuild.mjs`        → dist/
// `node esbuild.mjs --e2e`  → out/e2e/ (the @vscode/test-electron suite; never shipped)
// `node esbuild.mjs --action` → action/dist/index.js (the GitHub Action, committed; PRC-04)
// `node esbuild.mjs --cloud`  → cloud/public/viewer.js and viewer.css (the cloud's map viewer; CLD-03)
// `node esbuild.mjs --bench`  → out/bench/ and out/eval/ (the bench harness, its fit and the eval scorer; never shipped, CST-02, CST-06, ACC-04)
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
  "refresh-facts": "src/agent/refresh-facts.ts",
  "render-html": "src/agent/render-html.ts",
  validate: "src/agent/validate.ts",
  session: "src/agent/session.ts",
  "session-hook": "src/agent/session-hook.ts",
  "audit-record": "src/agent/audit-record.ts",
};

/**
 * The diagram page's script and stylesheet (RCH-01): the viewer with its layout, for a browser, with
 * any `</script` in string literals escaped so the script can sit inline in the page.
 * @returns {Promise<{ script: string, style: string, metafile: import("esbuild").Metafile | undefined }>}
 */
export function buildPage() {
  pageBuild ??= buildPageOnce();
  return pageBuild;
}

/** @type {ReturnType<typeof buildPageOnce> | undefined} */
let pageBuild;

async function buildPageOnce() {
  const result = await esbuild.build({
    ...common,
    entryPoints: [join(root, "webview/page.ts")],
    write: false,
    platform: "browser",
    format: "iife",
    target: "es2022",
    minify: true,
    supported: { "inline-script": false },
  });
  const output = result.outputFiles?.[0];
  if (output === undefined) throw new Error("buildPage: esbuild returned no output");
  const script = output.text.trimEnd();
  const style = `${readFileSync(join(root, "webview/styles.css"), "utf8")}\n${readFileSync(join(root, "webview/page.css"), "utf8")}`;
  return { script, style, metafile: result.metafile };
}

/**
 * The skill scripts: ESM for Node ≥ 18 with every dependency inlined (ADR 0007).
 * @param {string} outdir
 * @param {string[]} [names] which entries to build; default all (used by the test setup,
 *   which stages every script side by side in out/test-scripts/)
 */
export async function buildScripts(outdir, names = Object.keys(SCRIPT_ENTRIES)) {
  const page = names.includes("render-html") ? await buildPage() : null;
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
      ...(page ? { "process.env.SUSTAIN_PAGE_SCRIPT": JSON.stringify(page.script), "process.env.SUSTAIN_PAGE_STYLE": JSON.stringify(page.style) } : {}),
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
  results.push(await buildScripts(join(out, "skills/sustain-architecture/scripts"), ["repo-facts", "validate", "render-html"]));
  results.push(await buildScripts(join(out, "skills/sustain-bugfix/scripts"), ["session", "session-hook"]));
  // The refresh skill reads the same format reference as the architecture skill (FRS-05).
  cpSync(join(root, "skills/sustain-architecture/references"), join(out, "skills/sustain-refresh/references"), { recursive: true });
  results.push(await buildScripts(join(out, "skills/sustain-refresh/scripts"), ["refresh-facts", "validate", "render-html"]));
  results.push(await buildScripts(join(out, "skills/sustain-audit/scripts"), ["audit-record"]));
  writeSkillHashes(out);
  const page = await buildPage();
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
        "process.env.SUSTAIN_PAGE_SCRIPT": JSON.stringify(page.script),
        "process.env.SUSTAIN_PAGE_STYLE": JSON.stringify(page.style),
      },
    }),
  );
  return results;
}

/**
 * Copies the built scripts, and the refresh skill's shared references, back into skills/, so the
 * committed skills work as they are for `npx skills add` (RCH-02). CI fails when these are stale.
 * @param {string} out
 */
function syncCommittedSkills(out) {
  for (const name of readdirSync(join(out, "skills"))) {
    const built = join(out, "skills", name, "scripts");
    if (!existsSync(built)) continue;
    rmSync(join(root, "skills", name, "scripts"), { recursive: true, force: true });
    cpSync(built, join(root, "skills", name, "scripts"), { recursive: true });
  }
  rmSync(join(root, "skills/sustain-refresh/references"), { recursive: true, force: true });
  cpSync(join(root, "skills/sustain-architecture/references"), join(root, "skills/sustain-refresh/references"), { recursive: true });
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

  // The webviews: one IIFE each (the diagram one includes elkjs) loaded by nonce under a
  // strict CSP (NFR-SEC-01).
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
  // Export Page in the extension builds pages from the same assets as render-html.mjs.
  const page = await buildPage();
  writeFileSync(join(dist, "page.js"), page.script);
  writeFileSync(join(dist, "page.css"), page.style);
  const pageInputs = page.metafile;
  writeBundleInputs([...results.flatMap((result) => (result.metafile ? [result.metafile] : [])), ...(pageInputs ? [pageInputs] : [])]);
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

/** The cloud's map viewer: the diagram page's script and styles, served from cloud/public (CLD-03). */
export async function buildCloudViewer() {
  const page = await buildPage();
  mkdirSync(join(root, "cloud/public"), { recursive: true });
  writeFileSync(join(root, "cloud/public/viewer.js"), page.script);
  writeFileSync(join(root, "cloud/public/viewer.css"), page.style);
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
    target: "node20",
  });
}

/** The bench's and the eval's commands, run from out/bench and out/eval (CST-02, CST-06, ACC-04). */
async function buildBench() {
  for (const dir of ["bench", "eval"]) rmSync(join(root, "out", dir), { recursive: true, force: true });
  const entries = ["bench", "eval"].flatMap((dir) =>
    readdirSync(join(root, dir))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => join(root, dir, name)),
  );
  await esbuild.build({
    ...common,
    metafile: false,
    entryPoints: entries,
    outdir: join(root, "out"),
    outbase: root,
    platform: "node",
    format: "esm",
    target: "node20",
    outExtension: { ".js": ".mjs" },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--e2e")) await buildE2e();
  else if (process.argv.includes("--action")) await buildAction();
  else if (process.argv.includes("--cloud")) await buildCloudViewer();
  else if (process.argv.includes("--bench")) await buildBench();
  else await buildDist();
}
