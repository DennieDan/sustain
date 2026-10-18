// CLD-13: an owner's data as one JSON document without any secret, each repository's audit log of
// uploads, and the daily job that enforces each plan's history.
import { afterEach, beforeEach, expect, test } from "vitest";
import { POST as uploadRoute } from "../../src/app/api/v1/uploads/route";
import { openDatabase, type Database } from "../../src/db/client";
import { shareLinks, tokens, uploads } from "../../src/db/schema";
import { checkAccess, signIn, type SignedIn } from "../../src/lib/access";
import { setPlan } from "../../src/lib/billing";
import { exportData } from "../../src/lib/exportData";
import type { GitHubApi } from "../../src/lib/github";
import { enforceRetention } from "../../src/lib/retention";
import { useServices } from "../../src/lib/services";
import { createShare } from "../../src/lib/shares";
import { auditLog, createTokenRecord, saveUpload } from "../../src/lib/store";
import { newToken } from "../../src/lib/tokens";
import { COMMIT, MAP, mapUpload, oidcKeys, oidcToken } from "../support/fixtures";

const KEYS = oidcKeys();
const BILLING = { STRIPE_SECRET_KEY: "sk_test_unit", STRIPE_WEBHOOK_SECRET: "whsec_unit", STRIPE_TEAM_PRICE: "price_team" };
let db: Database;
let me: SignedIn;
let restore: () => void;

const github: GitHubApi = {
  async user() {
    return { id: 1, login: "dev", name: "Dev" };
  },
  async organizations() {
    return [{ id: 7, login: "acme" }];
  },
  async repository(_token, owner, name) {
    // The same id the OIDC tokens below carry for acme/shop.
    return { id: 4242, owner, name, private: true, defaultBranch: "main", permissions: { admin: true } };
  },
};

beforeEach(async () => {
  db = await openDatabase();
  me = await signIn(db, github, "gho_token");
  restore = useServices({ db: async () => db, jwks: async () => KEYS.jwks, github: () => github, user: async () => me });
});

afterEach(() => {
  restore();
  for (const key of Object.keys(BILLING)) delete process.env[key];
});

function upload(bearer: string): Promise<Response> {
  return uploadRoute(new Request("http://cloud.test/api/v1/uploads", { method: "POST", body: JSON.stringify(mapUpload()), headers: { authorization: `Bearer ${bearer}` } }));
}

test("CLD-13 the audit log names how each upload was signed, with its time and size", async () => {
  expect((await upload(oidcToken(KEYS.key))).status).toBe(201);
  const repo = (await checkAccess(db, github, me, "acme", "shop"))!.repo;
  const token = newToken();
  await createTokenRecord(db, repo.id, "laptop", token, me.userId);
  expect((await upload(token)).status).toBe(201);
  const log = await auditLog(db, repo.id);
  const size = JSON.stringify(mapUpload()).length;
  expect(log.map(({ via, size: bytes }) => ({ via, bytes }))).toEqual([
    { via: "the upload token laptop", bytes: size },
    { via: "GitHub Actions OIDC for acme/shop", bytes: size },
  ]);
  expect(log.every((entry) => entry.createdAt instanceof Date)).toBe(true);
});

test("CLD-13 the export holds the account, its organizations and each owned repository's plan, tokens, share links and uploads, and no secret", async () => {
  await upload(oidcToken(KEYS.key));
  const repo = (await checkAccess(db, github, me, "acme", "shop"))!.repo;
  const token = newToken();
  await createTokenRecord(db, repo.id, "laptop", token, me.userId);
  const share = await createShare(db, repo.id, 7, me.userId);
  await setPlan(db, "acme", { plan: "team", customer: "cus_1", seats: 3 });
  const data = (await exportData(db, me.userId)) as { user: { login: string }; organizations: string[]; repositories: { owner: string; name: string; plan: { plan: string; seats: number }; tokens: { name: string }[]; shareLinks: unknown[]; uploads: { kind: string; size: number }[] }[] };
  expect([data.user.login, data.organizations]).toEqual(["dev", ["acme"]]);
  expect(data.repositories.map((entry) => [entry.owner, entry.name, entry.plan.plan, entry.plan.seats, entry.tokens.map((row) => row.name), entry.shareLinks.length, entry.uploads.map((row) => row.kind)])).toEqual([["acme", "shop", "team", 3, ["laptop"], 1, ["map"]]]);
  const text = JSON.stringify(data);
  const [stored] = await db.select().from(tokens);
  const [link] = await db.select().from(shareLinks);
  for (const secret of [token, stored!.hash, share.token, link!.hash]) expect(text).not.toContain(secret);
});

test("CLD-13 retention removes what the plan no longer keeps, and keeps each repository's newest default-branch map", async () => {
  Object.assign(process.env, BILLING);
  await upload(oidcToken(KEYS.key));
  const repo = (await checkAccess(db, github, me, "acme", "shop"))!.repo;
  await db.delete(uploads);
  const now = new Date("2026-10-19T12:00:00Z");
  const save = (kind: "map" | "check", branch: string, daysAgo: number) =>
    saveUpload(db, { repoId: repo.id, kind, commit: COMMIT, branch, payload: kind === "map" ? { map: MAP } : { check: {} }, via: "oidc", createdAt: new Date(now.getTime() - daysAgo * 86_400_000) });
  const newestMain = await save("map", "main", 45);
  await save("map", "main", 60);
  await save("map", "feature", 40);
  await save("check", "feature", 31);
  const recent = await save("check", "feature", 2);
  expect(await enforceRetention(db, now)).toBe(3);
  expect((await db.select({ id: uploads.id }).from(uploads)).map((row) => row.id).sort()).toEqual([newestMain.id, recent.id].sort());
  await setPlan(db, "acme", { plan: "team" });
  await save("check", "feature", 400);
  expect(await enforceRetention(db, now)).toBe(0);
});
