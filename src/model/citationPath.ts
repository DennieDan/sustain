// The path-syntax rule of a citation (FR-VAL-05), shared by the validator, the extension and the
// diagram page (RCH-01). Browser-safe.

export const MAX_PATH_LENGTH = 240;

/**
 * The path-syntax rule: non-empty, at most 240 characters, relative (no leading `/`, no
 * `C:` drive prefix), `/` separators only, no NUL, and no empty, `.` or `..` segment.
 */
export function citationPathOk(path: string): boolean {
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return false;
  if (path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
