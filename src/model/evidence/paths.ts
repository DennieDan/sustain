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
