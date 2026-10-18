// CLD-07: signed Stripe webhooks set an account's plan, and the server enforces each plan's limits.
// Without Stripe keys billing is off and every account has every feature.
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { POST as webhook } from "../../src/app/api/stripe/webhook/route";
import { POST as shareRoute } from "../../src/app/api/v1/repos/[owner]/[repo]/shares/route";
import { POST as uploadRoute } from "../../src/app/api/v1/uploads/route";
import { openDatabase, type Database } from "../../src/db/client";
import { signIn, type SignedIn } from "../../src/lib/access";
import { applyEvent, planOfAccount, setPlan } from "../../src/lib/billing";
import type { GitHubApi } from "../../src/lib/github";
import { useServices } from "../../src/lib/services";
import { historySince } from "../../src/lib/store";
import { PLANS } from "../../plans";
import { mapUpload, oidcKeys, oidcToken } from "../support/fixtures";

const SECRET = "whsec_unit";
/** The real time, since the OIDC tokens are signed with it. */
const NOW = new Date();
const KEYS = oidcKeys();
const BILLING = { STRIPE_SECRET_KEY: "sk_test_unit", STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_TEAM_PRICE: "price_team" };
let db: Database;
let me: SignedIn;
let restore: () => void;

const github: GitHubApi = {
  async user() {
    return { id: 1, login: "dev", name: null };
  },
  async organizations() {
    return [{ id: 7, login: "acme" }];
  },
  async repository(_token, owner, name) {
    // The same id the OIDC tokens below carry for the repository.
    return { id: `${owner}/${name}`.length, owner, name, private: true, defaultBranch: "main", permissions: { admin: true } };
  },
};

beforeEach(async () => {
  db = await openDatabase();
  me = await signIn(db, github, "gho_token");
  restore = useServices({ db: async () => db, jwks: async () => KEYS.jwks, github: () => github, user: async () => me, now: () => NOW });
  Object.assign(process.env, BILLING);
});

afterEach(() => {
  restore();
  for (const key of Object.keys(BILLING)) delete process.env[key];
});

function signed(payload: string, at = NOW, secret = SECRET): string {
  const time = Math.floor(at.getTime() / 1000);
  return `t=${time},v1=${createHmac("sha256", secret).update(`${time}.${payload}`).digest("hex")}`;
}

function post(payload: string, signature: string | null): Promise<Response> {
  return webhook(new Request("http://cloud.test/api/stripe/webhook", { method: "POST", body: payload, headers: signature === null ? {} : { "stripe-signature": signature } }));
}

describe("CLD-07 webhooks", () => {
  const completed = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "acme", metadata: { account: "acme" }, customer: "cus_1", subscription: "sub_1" } } });

  test("a webhook signed with the secret sets the account to Team, and a wrong, missing or old signature changes nothing", async () => {
    expect((await post(completed, signed(completed, NOW, "whsec_other"))).status).toBe(400);
    expect((await post(completed, null)).status).toBe(400);
    expect((await post(completed, signed(completed, new Date(NOW.getTime() - 301_000)))).status).toBe(400);
    expect((await post(`${completed} `, signed(completed))).status).toBe(400);
    expect((await planOfAccount(db, "acme")).id).toBe("free");
    expect((await post(completed, signed(completed))).status).toBe(200);
    expect((await planOfAccount(db, "acme")).id).toBe("team");
  });

  test("a subscription that lapses or ends sets Free, and an active one sets Team with its seats", async () => {
    const subscription = (type: string, status: string): unknown => ({ type, data: { object: { status, metadata: { account: "acme" }, items: { data: [{ quantity: 4 }] } } } });
    await applyEvent(db, subscription("customer.subscription.updated", "active"), NOW);
    expect((await planOfAccount(db, "acme")).id).toBe("team");
    await applyEvent(db, subscription("customer.subscription.updated", "past_due"), NOW);
    expect((await planOfAccount(db, "acme")).id).toBe("free");
    await applyEvent(db, subscription("customer.subscription.updated", "trialing"), NOW);
    await applyEvent(db, subscription("customer.subscription.deleted", "canceled"), NOW);
    expect((await planOfAccount(db, "acme")).id).toBe("free");
  });
});

describe("CLD-07 limits", () => {
  const upload = (repo: string, visibility: "private" | "public"): Promise<Response> =>
    uploadRoute(
      new Request("http://cloud.test/api/v1/uploads", {
        method: "POST",
        body: JSON.stringify(mapUpload({ repo })),
        headers: { authorization: `Bearer ${oidcToken(KEYS.key, { repository: repo, repository_id: repo.length, repository_visibility: visibility })}` },
      }),
    );

  test("Free keeps maps of one private repository and any public ones, and Team keeps any number", async () => {
    expect((await upload("acme/one", "private")).status).toBe(201);
    expect((await upload("acme/one", "private")).status).toBe(201);
    const second = await upload("acme/second", "private");
    expect(second.status).toBe(402);
    expect(((await second.json()) as { message: string }).message).toBe("The Free plan keeps maps of 1 private repository. Upgrade to Team for more.");
    expect((await upload("acme/open-docs", "public")).status).toBe(201);
    await setPlan(db, "acme", { plan: "team" }, NOW);
    expect((await upload("acme/second", "private")).status).toBe(201);
  });

  test("Free keeps 30 days of history and makes no share links; without Stripe keys every account has every feature", async () => {
    expect(historySince(PLANS.free, NOW)).toEqual(new Date(NOW.getTime() - 30 * 86_400_000));
    expect(historySince(PLANS.team, NOW)).toBeNull();
    await upload("acme/one", "private");
    const share = (): Promise<Response> =>
      shareRoute(new Request("http://cloud.test/api/v1/repos/acme/one/shares", { method: "POST", body: JSON.stringify({ days: 7 }), headers: { "content-type": "application/json", origin: "http://cloud.test" } }), { params: Promise.resolve({ owner: "acme", repo: "one" }) });
    expect((await share()).status).toBe(402);
    for (const key of Object.keys(BILLING)) delete process.env[key];
    expect((await planOfAccount(db, "acme")).id).toBe("enterprise");
    expect((await share()).status).toBe(201);
    expect((await upload("acme/second", "private")).status).toBe(201);
  });
});
