import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const repoRoot = join(__dirname, "../../..");

/** Module specifiers referenced by static imports, re-exports, `require()` and `import()`. */
export function importSpecifiers(source: string): string[] {
  const patterns = [
    /\bimport\s+(?:type\s+)?[^'"]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?[^'";]*?\bfrom\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]!);
  }
  return found;
}

/** All `.ts`/`.mts`/`.js`/`.mjs` files under `dir` (repo-relative, `/`-separated); empty if `dir` is absent. */
export function sourceFiles(dir: string): string[] {
  const abs = join(repoRoot, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(m?ts|m?js)$/.test(name) && !name.endsWith(".d.ts")) {
        out.push(relative(repoRoot, path).split(sep).join("/"));
      }
    }
  };
  walk(abs);
  return out;
}

