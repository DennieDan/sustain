// ACC-02: TypeScript and JavaScript imports: static and dynamic imports, re-exports and `require`,
// resolved as relative paths or through the nearest tsconfig.json or jsconfig.json's `paths` and
// `baseUrl`. Package imports leave the repository and are skipped. Browser-safe.
import { dirOf, ImportSet, joinPath, lineAt, type ImportRef } from "./paths";

const SPECIFIERS = [
  /\bimport\s+(?:type\s+)?(?:[\w$*{}\s,]+?\s+from\s+)?["']([^"'\n]+)["']/g,
  /\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s+from\s+["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
];
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
/** A compiled extension in an import names its TypeScript source. */
const SOURCE_FOR: Record<string, string[]> = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
export const CONFIG_NAMES = ["tsconfig.json", "jsconfig.json"];

export interface PathConfig {
  /** Where `paths` targets resolve from: `baseUrl`, else the config's own folder. */
  base: string;
  baseUrl: string | null;
  paths: [pattern: string, targets: string[]][];
}

/** JSON with comments and trailing commas, as tsconfig files allow. */
function parseLoose(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2);
      if (i < 0) break;
      i++;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

/** The `paths` and `baseUrl` of the config at `path`, or `null` when it sets neither. */
export function pathConfig(path: string, text: string): PathConfig | null {
  let options: { baseUrl?: unknown; paths?: unknown } | undefined;
  try {
    options = (parseLoose(text) as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } }).compilerOptions;
  } catch {
    return null;
  }
  if (options === undefined) return null;
  const dir = dirOf(path);
  const baseUrl = typeof options.baseUrl === "string" ? joinPath(dir, options.baseUrl) : null;
  const paths = options.paths !== null && typeof options.paths === "object"
    ? Object.entries(options.paths as Record<string, unknown>).flatMap(([pattern, targets]) => (Array.isArray(targets) ? [[pattern, targets.filter((target): target is string => typeof target === "string")] as [string, string[]]] : []))
    : [];
  if (baseUrl === null && paths.length === 0) return null;
  return { base: baseUrl ?? dir, baseUrl, paths };
}

/** The file `base` names, trying TypeScript's extensions and index files. */
function resolveFile(base: string | null, files: ReadonlySet<string>): string | null {
  if (base === null) return null;
  const dot = base.lastIndexOf(".");
  const extension = dot > base.lastIndexOf("/") ? base.slice(dot) : "";
  const candidates = [base, ...(SOURCE_FOR[extension] ?? []).map((source) => base.slice(0, dot) + source), ...EXTENSIONS.map((ext) => base + ext), ...EXTENSIONS.map((ext) => `${base}/index${ext}`)];
  return candidates.find((candidate) => files.has(candidate)) ?? null;
}

/** `specifier` through `config`'s `paths`, then its `baseUrl`. */
function throughConfig(specifier: string, config: PathConfig, files: ReadonlySet<string>): string | null {
  for (const [pattern, targets] of config.paths) {
    const star = pattern.indexOf("*");
    const matched = star < 0 ? (specifier === pattern ? "" : null) : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1)) ? specifier.slice(star, specifier.length - (pattern.length - star - 1)) : null;
    if (matched === null) continue;
    for (const target of targets) {
      const found = resolveFile(joinPath(config.base, target.replace("*", matched)), files);
      if (found !== null) return found;
    }
  }
  return config.baseUrl === null ? null : resolveFile(joinPath(config.baseUrl, specifier), files);
}

/** The repository files `file` imports, with their lines. `configFor(dir)` gives the nearest config's paths. */
export function typescriptImports(file: string, text: string, files: ReadonlySet<string>, configFor: (dir: string) => PathConfig | null): ImportRef[] {
  const found = new ImportSet();
  for (const pattern of SPECIFIERS) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1]!;
      const resolved = specifier.startsWith(".")
        ? resolveFile(joinPath(dirOf(file), specifier), files)
        : (() => {
            const config = configFor(dirOf(file));
            return config === null ? null : throughConfig(specifier, config, files);
          })();
      if (resolved !== null && resolved !== file) found.add(resolved, lineAt(text, match.index));
    }
  }
  return found.refs();
}
