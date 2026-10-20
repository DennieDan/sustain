// `npm run package` (RCH-05): packages the extension with vsce. A LICENSE file is packaged when the
// repository has one; until then the package is made without it.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * vsce's arguments for this repository.
 * @param {boolean} hasLicense
 * @param {string[]} [extra]
 */
export function packageArgs(hasLicense, extra = []) {
  return ["package", "--no-dependencies", ...(hasLicense ? [] : ["--skip-license"]), ...extra];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const vsce = join(root, "node_modules/@vscode/vsce/vsce");
  const result = spawnSync(process.execPath, [vsce, ...packageArgs(existsSync(join(root, "LICENSE")), process.argv.slice(2))], { cwd: root, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}
