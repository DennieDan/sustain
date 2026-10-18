// ACC-02: `/`-separated repository paths, for resolving imports. Browser-safe.
export { dirOf } from "../ownership";

/** `rel` joined to `dir`, with `.` and `..` resolved; `null` when it leaves the repository. */
export function joinPath(dir: string, rel: string): string | null {
  const parts = dir === "" ? [] : dir.split("/");
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** An import of a repository file, at the line of its first import statement. */
export interface ImportRef {
  path: string;
  line: number;
}

/** The 1-based line of `index` in `text`. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let at = text.indexOf("\n"); at !== -1 && at < index; at = text.indexOf("\n", at + 1)) line++;
  return line;
}

/** Imported files, each kept with its first line. */
export class ImportSet {
  private readonly lines = new Map<string, number>();

  add(path: string, line: number): void {
    const seen = this.lines.get(path);
    if (seen === undefined || line < seen) this.lines.set(path, line);
  }

  delete(path: string): void {
    this.lines.delete(path);
  }

  /** Sorted by path. */
  refs(): ImportRef[] {
    return [...this.lines].sort(([a], [b]) => a.localeCompare(b)).map(([path, line]) => ({ path, line }));
  }
}
