// `npm run notices` and `npm run check:notices` (ENG-04): regenerate or check the bundled-package
// part of THIRD_PARTY_NOTICES.md from `out/meta/bundles.json`, which `npm run build` writes.
// Dependency-free Node ESM.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Everything from this heading on is generated. Everything before it is kept as written. */
export const BUNDLED_HEADING = "## Bundled packages";

/**
 * Package names from esbuild input paths. The last `node_modules/` segment decides, so a
 * nested dependency is named by itself. Scoped names keep their scope.
 * @param {string[]} inputs
 * @returns {string[]}
 */
export function packagesOf(inputs) {
  const names = new Set();
  for (const input of inputs) {
    const at = input.lastIndexOf("node_modules/");
    if (at < 0) continue;
    const parts = input.slice(at + "node_modules/".length).split("/");
    names.add(parts[0]?.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]);
  }
  return [...names].sort();
}

/**
 * Name, version, licence and licence text of an installed package.
 * @param {string} root
 * @param {string} name
 */
function describe(root, name) {
  const dir = join(root, "node_modules", name);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const licenceFile = readdirSync(dir).find((file) => /^licen[cs]e(\.(md|txt))?$/i.test(file));
  return {
    name,
    version: String(manifest.version),
    license: String(manifest.license ?? "unknown"),
    text: licenceFile ? readFileSync(join(dir, licenceFile), "utf8").trim() : null,
  };
}

/**
 * The notices file with its generated part replaced.
 * @param {string} current the file as it is now
 * @param {{ name: string, version: string, license: string, text: string | null }[]} packages
 */
export function renderNotices(current, packages) {
  const at = current.indexOf(BUNDLED_HEADING);
  const kept = (at < 0 ? current : current.slice(0, at)).trimEnd();
  const sections = packages.map((pkg) => {
    const text = pkg.text === null ? "The package ships no licence file." : `\`\`\`text\n${pkg.text}\n\`\`\``;
    return `### ${pkg.name} ${pkg.version}\n\n- License: ${pkg.license}\n\n${text}`;
  });
  return `${kept}\n\n${BUNDLED_HEADING}\n\nThe shipped bundles include these npm packages.\n\n${sections.join("\n\n")}\n`;
}

/**
 * Regenerates (`--write`) or checks (`--check`) the notices of the repository at `--root`.
 * @param {string[]} argv
 * @returns {number} exit code: 0 done or fresh, 1 stale, 2 usage or missing build output
 */
export function main(argv) {
  const mode = argv.includes("--write") ? "write" : argv.includes("--check") ? "check" : null;
  const rootFlag = argv.indexOf("--root");
  const root = rootFlag >= 0 ? resolve(argv[rootFlag + 1] ?? ".") : dirname(dirname(fileURLToPath(import.meta.url)));
  if (mode === null) {
    process.stderr.write("usage: node scripts/notices.mjs --write|--check [--root <dir>]\n");
    return 2;
  }
  const bundles = join(root, "out/meta/bundles.json");
  if (!existsSync(bundles)) {
    process.stderr.write("notices: out/meta/bundles.json is missing. Run npm run build first.\n");
    return 2;
  }
  const { inputs } = JSON.parse(readFileSync(bundles, "utf8"));
  const file = join(root, "THIRD_PARTY_NOTICES.md");
  const current = readFileSync(file, "utf8");
  const next = renderNotices(current, packagesOf(inputs).map((name) => describe(root, name)));
  if (mode === "write") {
    writeFileSync(file, next);
    return 0;
  }
  if (next === current) return 0;
  process.stderr.write("notices: THIRD_PARTY_NOTICES.md is out of date. Run npm run notices.\n");
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
