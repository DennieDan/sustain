// CLD-07: Sustain Cloud's plans and what each allows. The server enforces them; prices and Stripe's
// ids come from the environment. Without Stripe keys billing is off, and every account is Enterprise.

export type PlanId = "free" | "team" | "enterprise";

export interface Plan {
  id: PlanId;
  label: string;
  /** Private repositories an account may keep maps of, or `null` for any number. */
  privateRepositories: number | null;
  /** Days of map history kept, or `null` for all of it. */
  historyDays: number | null;
  pullPages: boolean;
  dashboard: boolean;
  shareLinks: boolean;
}

export const PLANS: Readonly<Record<PlanId, Plan>> = {
  free: { id: "free", label: "Free", privateRepositories: 1, historyDays: 30, pullPages: false, dashboard: false, shareLinks: false },
  team: { id: "team", label: "Team", privateRepositories: null, historyDays: null, pullPages: true, dashboard: true, shareLinks: true },
  enterprise: { id: "enterprise", label: "Enterprise", privateRepositories: null, historyDays: null, pullPages: true, dashboard: true, shareLinks: true },
};

/** Billing's configuration: Stripe's secret key, the webhook's signing secret and the Team price's id. */
export interface BillingConfig {
  secretKey: string;
  webhookSecret: string;
  teamPrice: string;
  /** What the Team plan costs, as shown on the settings page, such as "$8 per seat a month". */
  teamPriceText: string | null;
  /** Stripe's API, which tests replace. */
  apiUrl: string;
}

/** Billing's configuration, or `null` when billing is off because a Stripe value is missing. */
export function billingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig | null {
  const secretKey = env["STRIPE_SECRET_KEY"];
  const webhookSecret = env["STRIPE_WEBHOOK_SECRET"];
  const teamPrice = env["STRIPE_TEAM_PRICE"];
  if (!secretKey || !webhookSecret || !teamPrice) return null;
  return { secretKey, webhookSecret, teamPrice, teamPriceText: env["SUSTAIN_TEAM_PRICE_TEXT"] || null, apiUrl: (env["STRIPE_API_URL"] || "https://api.stripe.com").replace(/\/+$/, "") };
}

/** The plan in force: the stored one while billing is on, Free when none is stored, and Enterprise when billing is off. */
export function planFor(stored: PlanId | null | undefined, env: NodeJS.ProcessEnv = process.env): Plan {
  return billingConfig(env) === null ? PLANS.enterprise : PLANS[stored ?? "free"];
}

/** Why `plan` refuses maps of one more private repository when the account keeps maps of `kept` others, or `null`. */
export function privateRepositoryRefusal(plan: Plan, kept: number): string | null {
  if (plan.privateRepositories === null || kept < plan.privateRepositories) return null;
  return `The ${plan.label} plan keeps maps of ${plan.privateRepositories} private repositor${plan.privateRepositories === 1 ? "y" : "ies"}. Upgrade to Team for more.`;
}
