// SAF-03: strings that look like secrets never enter a map, a sidecar or an upload.
import { pointerToken, type Issue } from "./types";

/** Named patterns of well-known credential formats. */
const PATTERNS: readonly { kind: string; pattern: RegExp }[] = [
  { kind: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "GitHub token", pattern: /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/ },
  { kind: "API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { kind: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];

/** Shannon entropy of `text` in bits per character. */
function entropy(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * A run of 32 or more token characters with digits, both letter cases and high entropy.
 * Hex digests such as commit ids and content hashes never match, and `/` ends a run so
 * path segments are judged one at a time.
 */
function highEntropyRun(text: string): boolean {
  for (const match of text.matchAll(/[A-Za-z0-9+_=-]{32,}/g)) {
    const run = match[0];
    if (/^[0-9a-fA-F]+$/.test(run)) continue;
    if (/\d/.test(run) && /[a-z]/.test(run) && /[A-Z]/.test(run) && entropy(run) >= 4.2) return true;
  }
  return false;
}

/** What kind of secret `text` looks like, or `null`. */
export function secretKind(text: string): string | null {
  for (const { kind, pattern } of PATTERNS) if (pattern.test(text)) return kind;
  return highEntropyRun(text) ? "high-entropy string" : null;
}

/** One `SecretLike` issue for every string in `value` that looks like a secret. */
export function findSecrets(value: unknown, pointer = ""): Issue[] {
  if (typeof value === "string") {
    const kind = secretKind(value);
    return kind === null ? [] : [{ code: "SecretLike", pointer, message: `looks like a secret (${kind}). Remove it from the diagram.` }];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => findSecrets(item, `${pointer}/${index}`));
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => findSecrets(item, `${pointer}/${pointerToken(key)}`));
  }
  return [];
}
