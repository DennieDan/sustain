// CLD-02: the upload API accepts maps, sidecars, checks and metadata only, authenticated by an
// Actions OIDC token or a hashed per-repository token.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { checkUpload as validateUpload } from "../../../src/model/upload";
import { POST } from "../../src/app/api/v1/uploads/route";
import { openDatabase, type Database } from "../../src/db/client";
import { tokens, uploads } from "../../src/db/schema";
import { verifyOidc } from "../../src/lib/oidc";
import { useServices } from "../../src/lib/services";
import { createTokenRecord, upsertRepository, UPLOADS_PER_HOUR } from "../../src/lib/store";
import { hashToken, newToken } from "../../src/lib/tokens";
import { checkUpload, mapUpload, oidcKeys, oidcToken } from "../support/fixtures";

const KEYS = oidcKeys();
let db: Database;
let restore: () => void;

beforeEach(async () => {
  db = await openDatabase();
  restore = useServices({ db: async () => db, jwks: async () => KEYS.jwks });
});

afterEach(() => restore());

function post(body: unknown, bearer?: string, raw?: string): Promise<Response> {
  return POST(new Request("http://cloud.test/api/v1/uploads", { method: "POST", body: raw ?? JSON.stringify(body), headers: bearer ? { authorization: `Bearer ${bearer}` } : {} }));
}

describe("CLD-02 validation", () => {
  test("a valid map upload passes the shared check, and an extra content field anywhere is rejected", () => {
    expect(validateUpload(mapUpload())).toEqual([]);
    expect(validateUpload(mapUpload({ content: "export const secret = 1;" }))[0]).toMatchObject({ pointer: "/content", message: expect.stringContaining("unknown field `content`") });
    const map = structuredClone(mapUpload().map) as { components: Record<string, unknown>[] };
    map.components[0]!["content"] = "the file's code";
    expect(validateUpload(mapUpload({ map })).map((issue) => issue.pointer)).toContain("/map/components/0/content");
    expect(validateUpload(mapUpload({ sidecars: { run: { content: "x" } } })).length).toBeGreaterThan(0);
    expect(validateUpload(checkUpload(1, { check: { ...(checkUpload(1).check as object), source: "x" } })).length).toBeGreaterThan(0);
  });

  test("a secret anywhere is rejected", () => {
    const issues = validateUpload(mapUpload({ meta: { focus: "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB" } }));
    expect(issues).toEqual([expect.objectContaining({ code: "SecretLike", pointer: "/meta/focus" })]);
  });

  test("the route refuses over 1 MiB, non-JSON, a failing upload and a missing signature", async () => {
    expect((await post(null, undefined, "x".repeat(1024 * 1024 + 1))).status).toBe(413);
    expect((await post(null, "t", "{nope")).status).toBe(400);
    const extra = await post(mapUpload({ content: "code" }), "t");
    expect(extra.status).toBe(422);
    expect(((await extra.json()) as { errors: { pointer: string }[] }).errors[0]!.pointer).toBe("/content");
    expect((await post(mapUpload())).status).toBe(401);
  });
});

describe("CLD-02 OIDC", () => {
  test("a token signed by the test key, for Sustain Cloud and this repository, is accepted and creates the repository", async () => {
    const response = await post(mapUpload(), oidcToken(KEYS.key));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: "accepted", url: "/acme/shop" });
    const [row] = await db.select().from(uploads);
    expect(row).toMatchObject({ kind: "map", branch: "main", via: "oidc" });
    expect(row!.payload).toMatchObject({ map: { meta: { title: expect.any(String) } }, meta: { defaultBranch: "main" } });
  });

  test.each([
    ["another repository", { repository: "acme/other" }, {}, "issued for another repository"],
    ["another audience", { aud: "someone-else" }, {}, "wrong audience"],
    ["another issuer", { iss: "https://example.com" }, {}, "wrong issuer"],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 600 }, {}, "expired"],
    ["an unknown key", {}, { kid: "other" }, "unknown signing key"],
    ["another algorithm", {}, { alg: "HS256" }, "only RS256"],
  ])("%s is refused", (_name, claims, header, reason) => {
    expect(verifyOidc(oidcToken(KEYS.key, claims, header), "acme/shop", KEYS.jwks)).toEqual({ ok: false, reason: expect.stringContaining(reason) });
  });

  test("a token signed by another key is refused", () => {
    const other = oidcKeys();
    expect(verifyOidc(oidcToken(other.key), "acme/shop", KEYS.jwks)).toEqual({ ok: false, reason: "bad signature" });
  });
});

describe("CLD-02 upload tokens", () => {
  test("only the hash is stored, the token uploads to its repository, and a check is filed under its pull request", async () => {
    const repo = await upsertRepository(db, { githubId: 4242, owner: "acme", name: "shop", private: true });
    const token = newToken();
    await createTokenRecord(db, repo.id, "ci", token, null);
    const [stored] = await db.select().from(tokens);
    expect(stored!.hash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);

    const response = await post(checkUpload(7), token);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ url: "/acme/shop/pull/7" });
    const [row] = await db.select().from(uploads).where(eq(uploads.repoId, repo.id));
    expect(row).toMatchObject({ kind: "check", pull: 7, via: "token" });
    expect((await db.select().from(tokens))[0]!.lastUsedAt).not.toBeNull();
  });

  test("a token for another repository or an unknown token is refused", async () => {
    const other = await upsertRepository(db, { githubId: 1, owner: "acme", name: "other", private: true });
    const token = newToken();
    await createTokenRecord(db, other.id, "ci", token, null);
    expect((await post(mapUpload(), token)).status).toBe(403);
    expect((await post(mapUpload(), newToken())).status).toBe(403);
  });

  test("a repository is rate-limited per hour", async () => {
    const repo = await upsertRepository(db, { githubId: 4242, owner: "acme", name: "shop", private: true });
    const token = newToken();
    await createTokenRecord(db, repo.id, "ci", token, null);
    for (let i = 0; i < UPLOADS_PER_HOUR; i++) await db.insert(uploads).values({ repoId: repo.id, kind: "map", commit: "a".repeat(40), branch: "main", payload: {}, via: "token" });
    expect((await post(mapUpload(), token)).status).toBe(429);
  });
});
