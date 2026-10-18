// `npm run build:release [-- <out>]` (RCH-02): assembles <out>/plugin (release/plugin by default),
// a Claude Code plugin with the map skills as committed, its .claude-plugin/plugin.json and a
// marketplace manifest that lists it, so it can be installed from the repository or a release.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** The skills a Claude Code user installs; the bugfix skill is for Devin's learning sessions. */
export const PLUGIN_SKILLS = ["sustain-architecture", "sustain-refresh"];

const DESCRIPTION = "Architecture maps of your repository whose boxes open the code they cite, refreshed as the code changes.";

/** @param {string} out */
export function buildRelease(out) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const plugin = join(out, "plugin");
  rmSync(plugin, { recursive: true, force: true });
  mkdirSync(join(plugin, ".claude-plugin"), { recursive: true });
  for (const name of PLUGIN_SKILLS) cpSync(join(root, "skills", name), join(plugin, "skills", name), { recursive: true });
  const repository = typeof pkg.repository === "object" ? pkg.repository.url.replace(/\.git$/, "") : undefined;
  const manifest = {
    name: "sustain",
    version: pkg.version,
    description: DESCRIPTION,
    author: { name: "Sustain" },
    ...(pkg.homepage ? { homepage: pkg.homepage } : {}),
    ...(repository ? { repository } : {}),
    ...(pkg.license ? { license: pkg.license } : {}),
    keywords: ["architecture", "diagram", "archify", "code-map"],
  };
  writeFileSync(join(plugin, ".claude-plugin/plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const marketplace = { name: "sustain", owner: { name: "Sustain" }, plugins: [{ name: "sustain", source: "./", description: DESCRIPTION, version: pkg.version }] };
  writeFileSync(join(plugin, ".claude-plugin/marketplace.json"), `${JSON.stringify(marketplace, null, 2)}\n`);
  return plugin;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? join(root, "release"));
  process.stdout.write(`${buildRelease(out)}\n`);
}
