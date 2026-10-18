// CLD-02: per-repository upload tokens. A token is shown once at creation; only its SHA-256 is
// stored, and an upload is matched by hashing what it presents.
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "sus_";

export function newToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
