// RCH-02: the release's Claude Code plugin carries the map skills as committed, with its plugin and
// marketplace manifests.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildRelease, PLUGIN_SKILLS } from "../../scripts/release.mjs";
import { repoRoot } from "./support/sourceScan";
import { tempDir } from "./support/temp";

test("RCH-02 ACC-05 SKL-02 build:release assembles the plugin with its manifests and the committed skills", () => {
  const plugin = buildRelease(tempDir());
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { version: string };
  const manifest = JSON.parse(readFileSync(join(plugin, ".claude-plugin/plugin.json"), "utf8"));
  expect(manifest).toMatchObject({ name: "sustain", version: pkg.version, author: { name: "Sustain" } });
  expect(manifest.description).toMatch(/^Architecture maps/);
  const marketplace = JSON.parse(readFileSync(join(plugin, ".claude-plugin/marketplace.json"), "utf8"));
  expect(marketplace).toMatchObject({ name: "sustain", owner: { name: "Sustain" }, plugins: [{ name: "sustain", source: "./", version: pkg.version }] });
  expect(PLUGIN_SKILLS).toEqual(["sustain-architecture", "sustain-bugfix"]);
  const files: Record<string, string[]> = {
    "sustain-architecture": ["SKILL.md", "agents/openai.yaml", "scripts/validate.mjs", "references/archify-format.md"],
    "sustain-bugfix": ["SKILL.md", "agents/openai.yaml", "scripts/session.mjs"],
  };
  for (const name of PLUGIN_SKILLS) {
    for (const file of files[name]!) {
      expect(readFileSync(join(plugin, "skills", name, file), "utf8"), `${name}/${file}`).toBe(readFileSync(join(repoRoot, "skills", name, file), "utf8"));
    }
  }
});
