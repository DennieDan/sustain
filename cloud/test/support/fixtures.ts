// Shared pieces for the cloud tests: a valid map, upload bodies, OIDC keys and tokens.
import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OIDC_AUDIENCE, OIDC_ISSUER, type Jwks } from "../../src/lib/oidc";

export const MAP: Record<string, unknown> = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/archify/examples/rag-pipeline.architecture.json"), "utf8"));
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";

export function mapUpload(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return { repo: "acme/shop", commit: COMMIT, branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" }, ...fields };
}

export function checkUpload(pull: number, fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    repo: "acme/shop",
    commit: COMMIT,
    branch: "feature",
    kind: "check",
    check: {
      map: "architecture-shop-20261018-120000",
      base: "origin/main",
      head: "HEAD",
      mergeBase: COMMIT,
      touched: { strong: [{ id: "retriever", label: "Retriever" }], weak: [] },
      stale: [{ id: "llm", label: "LLM", state: "edited" }],
      uncovered: ["src/new.ts"],
      candidates: [{ dir: "src/payments", files: [{ path: "src/payments/a.ts", added: 12 }], lines: 12, label: "payments" }],
      gone: [],
      result: "pass",
      reasons: [],
    },
    meta: { pull },
    ...fields,
  };
}

/** A signing key pair standing in for GitHub's, and the JWKS that publishes it. */
export function oidcKeys(): { key: KeyObject; jwks: Jwks } {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return { key: privateKey, jwks: { keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" }] } };
}

/** An Actions OIDC token signed with `key`, with claims overridable. */
export function oidcToken(key: KeyObject, claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = part({ alg: "RS256", typ: "JWT", kid: "test-key", ...header });
  const body = part({
    iss: OIDC_ISSUER,
    aud: OIDC_AUDIENCE,
    iat: now,
    nbf: now - 5,
    exp: now + 300,
    repository: "acme/shop",
    repository_id: 4242,
    repository_owner: "acme",
    repository_visibility: "private",
    ...claims,
  });
  const signature = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key).toString("base64url");
  return `${head}.${body}.${signature}`;
}
