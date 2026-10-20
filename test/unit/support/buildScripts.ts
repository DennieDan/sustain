// vitest globalSetup: builds the skill scripts with the production esbuild config so the
// FR-VAL/FR-RF tests run the real `.mjs` bundles (`npm run check` runs vitest before build).
import { rmSync } from "node:fs";
import { join } from "node:path";
import { buildScripts, buildSkillsAndCli } from "../../../esbuild.mjs";
import { repoRoot } from "./sourceScan";

export const SCRIPTS_DIR = join(repoRoot, "out/test-scripts");
/** A dist folder with the skills, their hashes and the CLI (RCH-03). */
export const TEST_DIST = join(repoRoot, "out/test-dist");

export default async function setup(): Promise<void> {
  rmSync(SCRIPTS_DIR, { recursive: true, force: true });
  rmSync(TEST_DIST, { recursive: true, force: true });
  await buildScripts(SCRIPTS_DIR);
  await buildSkillsAndCli(TEST_DIST);
}
