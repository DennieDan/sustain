// ACC-02: Python imports, absolute and relative. A module is known by its dotted name from the
// repository root, from `src/`, and from the folder above its outermost package. Browser-safe.
import { dirOf, ImportSet, joinPath, lineAt, type ImportRef } from "./paths";

const IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]+as[ \t]+\w+)?(?:[ \t]*,[ \t]*[\w.]+(?:[ \t]+as[ \t]+\w+)?)*)/gm;
const FROM = /^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]+)/gm;

export interface PythonIndex {
  files: ReadonlySet<string>;
  /** Dotted module name to its files. */
  modules: Map<string, string[]>;
}

/** The dotted name of `path` from `root`, or `null` when it is not below it. */
function dotted(path: string, root: string): string | null {
  if (root !== "" && !path.startsWith(`${root}/`)) return null;
  const rel = (root === "" ? path : path.slice(root.length + 1)).replace(/\.py$/, "").replace(/\/__init__$/, "");
  return rel === "__init__" ? null : rel.split("/").join(".");
}

export function pythonIndex(files: readonly string[]): PythonIndex {
  const set = new Set(files);
  const modules = new Map<string, string[]>();
  for (const file of files) {
    // The outermost package: climb while the folder is a package.
    let packageDir: string | null = null;
    for (let dir = dirOf(file); dir !== "" && set.has(`${dir}/__init__.py`); dir = dirOf(dir)) packageDir = dir;
    const roots = new Set(["", "src", packageDir === null ? dirOf(file) : dirOf(packageDir)]);
    for (const root of roots) {
      const name = dotted(file, root);
      if (name !== null && name !== "") modules.set(name, [...new Set([...(modules.get(name) ?? []), file])]);
    }
  }
  return { files: set, modules };
}

/** The module file at `path` (a `/` path without `.py`), as a module or a package. */
function moduleAt(path: string | null, files: ReadonlySet<string>): string | null {
  if (path === null) return null;
  return [`${path}.py`, `${path}/__init__.py`].find((candidate) => files.has(candidate)) ?? null;
}

/** The files of the longest known prefix of `name`. */
function absolute(name: string, index: PythonIndex): string[] {
  for (let target = name; target !== ""; target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "") {
    const files = index.modules.get(target);
    if (files !== undefined) return files;
  }
  return [];
}

/** The repository files `file` imports, with their lines. */
export function pythonImports(file: string, text: string, index: PythonIndex): ImportRef[] {
  const found = new ImportSet();
  for (const match of text.matchAll(IMPORT)) {
    const line = lineAt(text, match.index);
    for (const part of match[1]!.split(",")) for (const target of absolute(part.trim().split(/[ \t]+/)[0]!, index)) found.add(target, line);
  }
  for (const match of text.matchAll(FROM)) {
    const [, dots, module, list] = match;
    const line = lineAt(text, match.index);
    const names = list!.replace(/[()]/g, "").split(",").map((name) => name.trim().split(/\s+/)[0]!).filter((name) => /^\w+$/.test(name));
    if (dots === "") {
      for (const name of names) {
        const sub = index.modules.get(`${module}.${name}`);
        if (sub !== undefined) for (const target of sub) found.add(target, line);
        else for (const target of absolute(module!, index)) found.add(target, line);
      }
      continue;
    }
    // One dot is the file's own package; each further dot goes up one folder.
    let base: string | null = dirOf(file);
    for (let i = 1; i < dots!.length && base !== null; i++) base = base === "" ? null : dirOf(base);
    const modulePath = base === null ? null : module === "" ? base : joinPath(base, module!.split(".").join("/"));
    for (const name of names) {
      const target = moduleAt(modulePath === null ? null : joinPath(modulePath, name), index.files) ?? moduleAt(modulePath, index.files);
      if (target !== null) found.add(target, line);
    }
  }
  found.delete(file);
  return found.refs();
}
