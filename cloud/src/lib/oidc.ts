// CLD-02: GitHub Actions OIDC tokens. A token is accepted when GitHub signed it (RS256, a key
// from GitHub's JWKS), it is for Sustain Cloud and unexpired, and it names the uploaded repository.
import { createPublicKey, verify, type JsonWebKeyInput } from "node:crypto";

export const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const OIDC_AUDIENCE = "sustain-cloud";

/** The repository facts an Actions token carries. */
export interface OidcClaims {
  repository: string;
  repositoryId: number;
  repositoryOwner: string;
  visibility: string;
}

export type Jwks = { keys: (JsonWebKeyInput["key"] & { kid?: string })[] };

function decode(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
}

/** The claims of a valid token for `repo`, or why it is refused. Allows 60 s of clock skew. */
export function verifyOidc(token: string, repo: string, jwks: Jwks, now = Date.now()): { ok: true; claims: OidcClaims } | { ok: false; reason: string } {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "not a JWT" };
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decode(parts[0]!);
    payload = decode(parts[1]!);
  } catch {
    return { ok: false, reason: "unreadable JWT" };
  }
  if (header["alg"] !== "RS256") return { ok: false, reason: "only RS256 tokens are accepted" };
  const jwk = jwks.keys.find((key) => key.kid === header["kid"]);
  if (!jwk) return { ok: false, reason: "unknown signing key" };
  const signed = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2]!, "base64url"));
  if (!signed) return { ok: false, reason: "bad signature" };
  if (payload["iss"] !== OIDC_ISSUER) return { ok: false, reason: "wrong issuer" };
  const audience = payload["aud"];
  if (!(audience === OIDC_AUDIENCE || (Array.isArray(audience) && audience.includes(OIDC_AUDIENCE)))) return { ok: false, reason: "wrong audience" };
  const seconds = now / 1000;
  if (typeof payload["exp"] !== "number" || payload["exp"] < seconds - 60) return { ok: false, reason: "expired" };
  if (typeof payload["nbf"] === "number" && payload["nbf"] > seconds + 60) return { ok: false, reason: "not yet valid" };
  if (payload["repository"] !== repo) return { ok: false, reason: "issued for another repository" };
  return {
    ok: true,
    claims: {
      repository: repo,
      repositoryId: Number(payload["repository_id"]),
      repositoryOwner: String(payload["repository_owner"] ?? repo.split("/")[0]),
      visibility: String(payload["repository_visibility"] ?? "private"),
    },
  };
}

let cached: { jwks: Jwks; at: number } | undefined;

/** GitHub's signing keys, cached for an hour. */
export async function githubJwks(fetcher: typeof fetch = fetch): Promise<Jwks> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.jwks;
  const response = await fetcher(`${OIDC_ISSUER}/.well-known/jwks`);
  if (!response.ok) throw new Error(`GitHub JWKS: ${response.status}`);
  cached = { jwks: (await response.json()) as Jwks, at: Date.now() };
  return cached.jwks;
}
