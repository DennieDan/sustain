// CLD-11: owners delete a map, a repository's data or their account, at once; only same-site
// requests from an owner may change anything.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { DELETE as deleteAccountRoute } from "../../src/app/api/v1/account/route";
import { POST as publicRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/public/route";
import { DELETE as deleteRepoRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/route";
import { DELETE as revokeRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/tokens/[id]/route";
import { POST as tokenRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/tokens/route";
import { DELETE as deleteUploadRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/uploads/[id]/route";
import { openDatabase, type Database } from "../../src/db/client";
import { access, memberships, repositories, tokens, uploads, users } from "../../src/db/schema";
import { signIn, type SignedIn } from "../../src/lib/access";
import type { GitHubApi, GitHubPermissions } from "../../src/lib/github";
import { useServices } from "../../src/lib/services";
import { createTokenRecord, mapHistory, saveUpload, upsertRepository } from "../../src/lib/store";
import { newToken } from "../../src/lib/tokens";
import { COMMIT, MAP } from "../support/fixtures";

const ORIGIN = "http://cloud.test";
let db: Database;
let me: SignedIn;
let restore: () => void;
const permissions: Record<string, GitHubPermissions> = {};
/** GitHub's repository ids, by name. */
const IDS: Record<string, number> = { shop: 1, notes: 2, secret: 3 };

const github: GitHubApi = {
  async user() {
    return { id: 1, login: "dev", name: null };
  },
  async organizations() {
    return [{ id: 7, login: "acme" }];
  },
  async repository(_token, owner, name) {
    const perms = permissions[`${owner}/${name}`];
    return perms ? { id: IDS[name] ?? 99, owner, name, private: name === "secret", defaultBranch: "main", permissions: perms } : null;
  },
};

function request(method: string, path: string, body?: unknown, origin: string | null = ORIGIN): Request {
  return new Request(`${ORIGIN}${path}`, { method, headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

function params<T>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}

beforeEach(async () => {
  db = await openDatabase();
  permissions["acme/shop"] = { admin: true };
  me = await signIn(db, github, "gho_token");
  restore = useServices({ db: async () => db, github: () => github, user: async () => me });
});

afterEach(() => restore());

async function seed(owner = "acme", name = "shop"): Promise<number> {
  const repo = await upsertRepository(db, { githubId: IDS[name]!, owner, name, private: false });
  await saveUpload(db, { repoId: repo.id, kind: "map", commit: COMMIT, branch: "main", payload: { map: MAP, meta: {} }, via: "token" });
  await saveUpload(db, { repoId: repo.id, kind: "check", commit: COMMIT, branch: "feature", pull: 3, payload: { check: {} }, via: "token" });
  await createTokenRecord(db, repo.id, "ci", newToken(), me.userId);
  return repo.id;
}

describe("CLD-11 deletion", () => {
  test("an owner deletes one map at once, and the rest stays", async () => {
    const repoId = await seed();
    const [map] = await mapHistory(db, repoId);
    const response = await deleteUploadRoute(request("DELETE", `/api/v1/repos/acme/shop/uploads/${map!.id}`), params({ owner: "acme", repo: "shop", id: String(map!.id) }));
    expect(response.status).toBe(200);
    expect(await mapHistory(db, repoId)).toEqual([]);
    expect((await db.select().from(uploads)).map((row) => row.kind)).toEqual(["check"]);
  });

  test("deleting a repository's data removes its uploads, checks, tokens and access", async () => {
    await seed();
    expect((await deleteRepoRoute(request("DELETE", "/api/v1/repos/acme/shop"), params({ owner: "acme", repo: "shop" }))).status).toBe(200);
    for (const table of [repositories, uploads, tokens, access]) expect(await db.select().from(table)).toEqual([]);
  });

  test("deleting an account removes the user, memberships and the spaces the account owns, not others'", async () => {
    permissions["dev/notes"] = { admin: true };
    await seed("acme", "shop");
    await seed("dev", "notes");
    expect((await deleteAccountRoute(request("DELETE", "/api/v1/account"))).status).toBe(200);
    expect(await db.select().from(users)).toEqual([]);
    expect(await db.select().from(memberships)).toEqual([]);
    expect((await db.select().from(repositories)).map((repo) => `${repo.owner}/${repo.name}`)).toEqual(["acme/shop"]);
    expect((await db.select().from(tokens)).length).toBe(1);
  });

  test("only owners may change a repository, and only from this site", async () => {
    await seed();
    permissions["acme/shop"] = { push: true };
    await signIn(db, github, "gho_token");
    expect((await deleteRepoRoute(request("DELETE", "/api/v1/repos/acme/shop"), params({ owner: "acme", repo: "shop" }))).status).toBe(403);
    permissions["acme/shop"] = { admin: true };
    await signIn(db, github, "gho_token");
    expect((await deleteRepoRoute(request("DELETE", "/api/v1/repos/acme/shop", undefined, "https://evil.example"), params({ owner: "acme", repo: "shop" }))).status).toBe(403);
    expect((await deleteRepoRoute(request("DELETE", "/api/v1/repos/acme/shop", undefined, null), params({ owner: "acme", repo: "shop" }))).status).toBe(403);
    restore();
    restore = useServices({ db: async () => db, github: () => github, user: async () => null });
    expect((await deleteAccountRoute(request("DELETE", "/api/v1/account"))).status).toBe(401);
    expect((await db.select().from(repositories)).length).toBe(1);
  });
});

describe("CLD-02 CLD-03 owner settings", () => {
  test("a token is created once and revoked; public maps need a public repository", async () => {
    await seed();
    const created = await tokenRoute(request("POST", "/api/v1/repos/acme/shop/tokens", { name: "laptop" }), params({ owner: "acme", repo: "shop" }));
    const { id, token } = (await created.json()) as { id: number; token: string };
    expect(token).toMatch(/^sus_/);
    expect((await revokeRoute(request("DELETE", `/api/v1/repos/acme/shop/tokens/${id}`), params({ owner: "acme", repo: "shop", id: String(id) }))).status).toBe(200);
    expect((await publicRoute(request("POST", "/api/v1/repos/acme/shop/public", { public: true }), params({ owner: "acme", repo: "shop" }))).status).toBe(200);
    expect((await db.select().from(repositories))[0]!.publicMaps).toBe(true);

    permissions["acme/secret"] = { admin: true };
    await upsertRepository(db, { githubId: 3, owner: "acme", name: "secret", private: true });
    expect((await publicRoute(request("POST", "/api/v1/repos/acme/secret/public", { public: true }), params({ owner: "acme", repo: "secret" }))).status).toBe(409);
  });
});
