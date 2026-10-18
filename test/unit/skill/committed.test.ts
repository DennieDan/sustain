// RCH-02: the skills are committed with their built scripts, so `npx skills add` copies working
// skills. The committed scripts equal a fresh build, and the refresh skill carries the shared
// format reference.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { TEST_DIST } from "../support/buildScripts";
import { repoRoot } from "../support/sourceScan";

const SCRIPTS: Record<string, string[]> = {
  "sustain-architecture": ["render-html.mjs", "repo-facts.mjs", "validate.mjs"],
  "sustain-audit": ["audit-record.mjs"],
  "sustain-bugfix": ["session-hook.mjs", "session.mjs"],
  "sustain-refresh": ["refresh-facts.mjs", "render-html.mjs", "validate.mjs"],
};

test.each(Object.entries(SCRIPTS))("RCH-02 ACC-05 %s's committed scripts are what the build makes now", (name, scripts) => {
  expect(readdirSync(join(repoRoot, "skills", name, "scripts")).sort()).toEqual(scripts);
  for (const script of scripts) {
    const committed = readFileSync(join(repoRoot, "skills", name, "scripts", script), "utf8");
    expect(committed === readFileSync(join(TEST_DIST, "skills", name, "scripts", script), "utf8"), `${name}/scripts/${script} is stale; run npm run build`).toBe(true);
  }
});

test("RCH-02 the refresh skill's references are the architecture skill's", () => {
  const reference = (name: string): string => readFileSync(join(repoRoot, "skills", name, "references/archify-format.md"), "utf8");
  expect(reference("sustain-refresh")).toBe(reference("sustain-architecture"));
});
