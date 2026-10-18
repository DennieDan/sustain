// CLD-07: who may buy or manage an account's plan: a signed-in owner of one of its repositories, from
// this site, while billing is on.
import { and, eq } from "drizzle-orm";
import { billingConfig, type BillingConfig } from "../../plans";
import { access, repositories } from "../db/schema";
import type { SignedIn } from "./access";
import { refuse, signedIn } from "./requests";
import { services } from "./services";

/** The account named in the request's body when the user owns one of its repositories, or a refusal. */
export async function billedAccount(request: Request): Promise<{ user: SignedIn; account: string; config: BillingConfig; site: string } | Response> {
  const config = billingConfig();
  if (config === null) return refuse(404, "Billing is off on this server.");
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  const body = (await request.json().catch(() => ({}))) as { account?: unknown };
  if (typeof body.account !== "string" || body.account === "") return refuse(400, "Name the account.");
  const db = await services().db();
  const [owned] = await db
    .select({ repo: repositories.id })
    .from(access)
    .innerJoin(repositories, eq(access.repoId, repositories.id))
    .where(and(eq(access.userId, user.userId), eq(access.role, "owner"), eq(repositories.owner, body.account)));
  if (!owned) return refuse(403, "Only an owner of one of the account's repositories can change its plan.");
  const site = (process.env["NEXTAUTH_URL"] || new URL(request.url).origin).replace(/\/+$/, "");
  return { user, account: body.account, config, site };
}
