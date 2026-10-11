// vitest globalSetup: builds the skill scripts with the production esbuild config so the
// FR-VAL/FR-RF tests run the real `.mjs` bundles (`npm run check` runs vitest before build).
import { rmSync } from "node:fs";
import { join } from "node:path";
import { buildScripts } from "../../../esbuild.mjs";
import { repoRoot } from "./sourceScan";

export const SCRIPTS_DIR = join(repoRoot, "out/test-scripts");

export default async function setup(): Promise<void> {
  rmSync(SCRIPTS_DIR, { recursive: true, force: true });
  await buildScripts(SCRIPTS_DIR);
}
