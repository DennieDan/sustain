// CLD-07: each account's plan, Stripe Checkout and the Customer Portal through Stripe's REST API, and
// the webhook that sets the plan once its signature checks out. An account is the GitHub login that
// owns repositories, a person's or an organization's.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { planFor, type BillingConfig, type Plan, type PlanId } from "../../plans";
import type { Database } from "../db/client";
import { access, accountPlans, repositories, uploads } from "../db/schema";

/** How far a webhook's signed time may be from now. */
export const SIGNATURE_TOLERANCE_S = 300;

export async function storedPlan(db: Database, account: string): Promise<typeof accountPlans.$inferSelect | undefined> {
  const [row] = await db.select().from(accountPlans).where(eq(accountPlans.account, account));
  return row;
}

/** The plan in force for `account`. */
export async function planOfAccount(db: Database, account: string, env: NodeJS.ProcessEnv = process.env): Promise<Plan> {
  return planFor((await storedPlan(db, account))?.plan, env);
}

export async function setPlan(db: Database, account: string, fields: { plan: PlanId; customer?: string; subscription?: string; seats?: number }, now = new Date()): Promise<void> {
  const values = { plan: fields.plan, updatedAt: now, ...(fields.customer ? { stripeCustomer: fields.customer } : {}), ...(fields.subscription ? { stripeSubscription: fields.subscription } : {}), ...(fields.seats ? { seats: fields.seats } : {}) };
  await db.insert(accountPlans).values({ account, ...values }).onConflictDoUpdate({ target: accountPlans.account, set: values });
}

/** The private repositories of `account`, other than `repoId`, that hold uploads. */
export async function privateRepositoriesKept(db: Database, account: string, repoId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${uploads.repoId})::int` })
    .from(uploads)
    .innerJoin(repositories, eq(uploads.repoId, repositories.id))
    .where(and(eq(repositories.owner, account), eq(repositories.private, true), ne(uploads.repoId, repoId)));
  return row?.count ?? 0;
}

/** Seats to buy for `account`: the people with access to its repositories here, at least one. */
export async function seatsOf(db: Database, account: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(distinct ${access.userId})::int` })
    .from(access)
    .innerJoin(repositories, eq(access.repoId, repositories.id))
    .where(eq(repositories.owner, account));
  return Math.max(1, row?.count ?? 0);
}

async function stripe(config: BillingConfig, path: string, params: Record<string, string>, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const response = await fetcher(`${config.apiUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Stripe answered ${response.status}.`);
  return body;
}

/** A Stripe Checkout page that subscribes `account` to Team for `seats`, returning to `site`. */
export async function checkoutUrl(config: BillingConfig, account: string, seats: number, site: string, fetcher?: typeof fetch): Promise<string> {
  const session = await stripe(
    config,
    "/v1/checkout/sessions",
    {
      mode: "subscription",
      "line_items[0][price]": config.teamPrice,
      "line_items[0][quantity]": String(seats),
      success_url: `${site}/settings?upgraded=${encodeURIComponent(account)}`,
      cancel_url: `${site}/settings`,
      client_reference_id: account,
      "metadata[account]": account,
      "subscription_data[metadata][account]": account,
    },
    fetcher,
  );
  if (typeof session["url"] !== "string") throw new Error("Stripe sent no checkout page.");
  return session["url"];
}

/** A Stripe Customer Portal page for `customer`, returning to `site`. */
export async function portalUrl(config: BillingConfig, customer: string, site: string, fetcher?: typeof fetch): Promise<string> {
  const session = await stripe(config, "/v1/billing_portal/sessions", { customer, return_url: `${site}/settings` }, fetcher);
  if (typeof session["url"] !== "string") throw new Error("Stripe sent no portal page.");
  return session["url"];
}

/** Whether the `Stripe-Signature` header signs `payload` with `secret`, at a time within the tolerance of `now`. */
export function signatureValid(payload: string, header: string | null, secret: string, now = new Date()): boolean {
  if (header === null) return false;
  const pairs = header.split(",").map((part) => part.trim().split("=") as [string, string | undefined]);
  const time = pairs.find(([key]) => key === "t")?.[1];
  const signatures = pairs.filter(([key, value]) => key === "v1" && value !== undefined).map(([, value]) => value!);
  if (time === undefined || !/^\d+$/.test(time) || signatures.length === 0) return false;
  if (Math.abs(now.getTime() / 1000 - Number(time)) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${time}.${payload}`).digest();
  return signatures.some((signature) => {
    const given = Buffer.from(signature, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Sets the plan a verified Stripe event decides; returns the account it changed, or `null` for an event that changes none. */
export async function applyEvent(db: Database, event: unknown, now = new Date()): Promise<string | null> {
  const typed = event as { type?: unknown; data?: { object?: Record<string, unknown> } };
  const object = typed.data?.object ?? {};
  const metadata = (object["metadata"] ?? {}) as Record<string, unknown>;
  const account = typeof metadata["account"] === "string" ? metadata["account"] : object["client_reference_id"];
  if (typeof account !== "string" || account === "") return null;
  const id = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
  switch (typed.type) {
    case "checkout.session.completed":
      await setPlan(db, account, { plan: "team", ...(id(object["customer"]) ? { customer: id(object["customer"])! } : {}), ...(id(object["subscription"]) ? { subscription: id(object["subscription"])! } : {}) }, now);
      return account;
    case "customer.subscription.updated": {
      const items = (object["items"] as { data?: { quantity?: unknown }[] } | undefined)?.data ?? [];
      const seats = typeof items[0]?.quantity === "number" ? items[0].quantity : undefined;
      const active = object["status"] === "active" || object["status"] === "trialing";
      await setPlan(db, account, { plan: active ? "team" : "free", ...(seats ? { seats } : {}) }, now);
      return account;
    }
    case "customer.subscription.deleted":
      await setPlan(db, account, { plan: "free" }, now);
      return account;
    default:
      return null;
  }
}
