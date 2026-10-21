// The citation deny-list (FR-VAL-05), ported from the prototype's `archalign-repo/src/deny.rs`.
//
// Rules apply to every `/`-separated segment, case-insensitively (on case-insensitive file
// systems `.ENV` opens the same file as `.env`). Browser-safe: no imports.

const DENIED_NAMES = [".git", ".archify", ".npmrc", ".pypirc", ".netrc"];
const ENV_EXCEPTIONS = [".env.example", ".env.sample"];
const DENIED_PREFIXES = ["id_rsa", "id_ed25519"];
const DENIED_EXTENSIONS = ["pem", "key", "p12", "pfx"];

/** Whether one path segment matches a deny rule. */
export function segmentDenied(segment: string): boolean {
  const name = segment.toLowerCase();
  if (DENIED_NAMES.includes(name)) return true;
  if (name === ".env" || (name.startsWith(".env.") && !ENV_EXCEPTIONS.includes(name))) return true;
  if (DENIED_PREFIXES.some((prefix) => name.startsWith(prefix))) return true;
  const dot = name.lastIndexOf(".");
  return dot >= 0 && DENIED_EXTENSIONS.includes(name.slice(dot + 1));
}

/** Whether any segment of the `/`-separated `path` is denied. */
export function isDenied(path: string): boolean {
  return path.split("/").some(segmentDenied);
}
