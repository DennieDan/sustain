// SAF-01: the file hashes of a skill folder. The build writes them for the shipped skills, and the
// extension compares installed copies with them. `esbuild.mjs` loads this module through Node's
// type stripping. It therefore imports no other source file, and its `.mts` name tells Node it is
// an ES module.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The value recorded for a link inside a skill folder. Links are never followed. */
export const LINK_MARK = "link";

/** SHA-256 of every file below `dir`, keyed by `/`-separated relative path. */
export function hashTree(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const key = prefix === "" ? name : `${prefix}/${name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) out[key] = LINK_MARK;
    else if (stat.isDirectory()) Object.assign(out, hashTree(path, key));
    else out[key] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return out;
}
