// ACC-02: Java imports. Each file's package declaration and name give its class, so imports resolve
// through whatever source roots the repository uses. Classes in the same package need no import, so
// a same-package class named in the text counts as a link too. Browser-safe.
const PACKAGE = /^\s*package\s+([\w.]+)\s*;/m;
const IMPORT = /^\s*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;/gm;

export interface JavaIndex {
  /** Fully qualified class name to file. */
  classes: Map<string, string>;
  /** Package to its files. */
  packages: Map<string, string[]>;
  /** File to its package. */
  packageOf: Map<string, string>;
}

const baseName = (path: string): string => path.slice(path.lastIndexOf("/") + 1).replace(/\.java$/, "");

export function javaIndex(files: readonly string[], read: (path: string) => string | null): JavaIndex {
  const index: JavaIndex = { classes: new Map(), packages: new Map(), packageOf: new Map() };
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    const pkg = PACKAGE.exec(text)?.[1] ?? "";
    index.classes.set(pkg === "" ? baseName(file) : `${pkg}.${baseName(file)}`, file);
    index.packages.set(pkg, [...(index.packages.get(pkg) ?? []), file]);
    index.packageOf.set(file, pkg);
  }
  return index;
}

/** The repository files `file` uses: its imports, and same-package classes it names. */
export function javaImports(file: string, text: string, index: JavaIndex): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(IMPORT)) {
    const [, , name, star] = match;
    if (star) {
      const classFile = index.classes.get(name!);
      if (classFile !== undefined) found.add(classFile);
      else for (const member of index.packages.get(name!) ?? []) found.add(member);
      continue;
    }
    // A static import names a member, and a nested class sits in its outer class's file, so the
    // name is shortened until it names a class.
    for (let target = name!; target !== ""; target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "") {
      const classFile = index.classes.get(target);
      if (classFile !== undefined) {
        found.add(classFile);
        break;
      }
    }
  }
  const pkg = index.packageOf.get(file) ?? "";
  const body = text.replace(PACKAGE, "").replace(IMPORT, "");
  for (const other of index.packages.get(pkg) ?? []) {
    if (other !== file && new RegExp(`\\b${baseName(other)}\\b`).test(body)) found.add(other);
  }
  found.delete(file);
  return [...found].sort();
}
