// ACC-02: Java imports. Each file's package declaration and name give its class, so imports resolve
// through whatever source roots the repository uses. Classes in the same package need no import, so
// a same-package class named in the text counts as a link too. Browser-safe.
import { ImportSet, lineAt, type ImportRef } from "./paths";
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

/** The repository files `file` uses, with the line of each: its imports, and same-package classes it names. */
export function javaImports(file: string, text: string, index: JavaIndex): ImportRef[] {
  const found = new ImportSet();
  for (const match of text.matchAll(IMPORT)) {
    const [, , name, star] = match;
    const line = lineAt(text, match.index);
    if (star) {
      const classFile = index.classes.get(name!);
      if (classFile !== undefined) found.add(classFile, line);
      else for (const member of index.packages.get(name!) ?? []) found.add(member, line);
      continue;
    }
    // A static import names a member, and a nested class sits in its outer class's file, so the
    // name is shortened until it names a class.
    for (let target = name!; target !== ""; target = target.includes(".") ? target.slice(0, target.lastIndexOf(".")) : "") {
      const classFile = index.classes.get(target);
      if (classFile !== undefined) {
        found.add(classFile, line);
        break;
      }
    }
  }
  const pkg = index.packageOf.get(file) ?? "";
  for (const other of index.packages.get(pkg) ?? []) {
    if (other === file) continue;
    for (const use of text.matchAll(new RegExp(`\\b${baseName(other)}\\b`, "g"))) {
      const line = lineAt(text, use.index);
      if (/^\s*(package|import)\b/.test(text.split("\n")[line - 1] ?? "")) continue;
      found.add(other, line);
      break;
    }
  }
  found.delete(file);
  return found.refs();
}
