// The account: organizations, repository spaces and roles, the plans of the accounts the user owns
// repositories of, and deleting the account (CLD-01, CLD-07, CLD-11).
import { redirect } from "next/navigation";
import { billingConfig } from "../../../plans";
import { DeleteButton, PlanButton } from "../../components/Actions";
import { organizationsOf, spacesOf } from "../../lib/access";
import { planOfAccount, storedPlan } from "../../lib/billing";
import { services } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await services().user();
  if (!user) redirect("/signin?callbackUrl=/settings");
  const db = await services().db();
  const orgs = await organizationsOf(db, user.userId);
  const spaces = await spacesOf(db, user.userId);
  const billing = billingConfig();
  const accounts = [...new Set(spaces.filter((space) => space.role === "owner").map((space) => space.repo.owner))].sort();
  const plans = await Promise.all(accounts.map(async (account) => ({ account, plan: await planOfAccount(db, account), customer: (await storedPlan(db, account))?.stripeCustomer ?? null })));
  return (
    <main className="page">
      <h1>{user.login}</h1>
      <h2>Organizations</h2>
      <p className="orgs">{orgs.length === 0 ? <span className="muted">None</span> : orgs.join(", ")}</p>
      <h2>Repositories</h2>
      {spaces.length === 0 ? (
        <p className="muted">Open a repository&apos;s map at /owner/name to add it here.</p>
      ) : (
        <ul className="spaces">
          {spaces.map(({ repo, role }) => (
            <li key={repo.id}>
              <a href={`/${repo.owner}/${repo.name}`}>
                {repo.owner}/{repo.name}
              </a>{" "}
              <span className="muted">{role}</span>
              {role === "owner" ? (
                <>
                  {" · "}
                  <a href={`/settings/${repo.owner}/${repo.name}`}>Settings</a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <h2>Plans</h2>
      {billing === null ? (
        <p className="muted">Billing is off on this server, so every account has every feature.</p>
      ) : plans.length === 0 ? (
        <p className="muted">Plans belong to the accounts whose repositories you own.</p>
      ) : (
        <ul className="plans">
          {plans.map(({ account, plan, customer }) => (
            <li key={account}>
              {account}: <strong className="plan-name">{plan.label}</strong>{" "}
              {plan.id === "free" ? (
                <>
                  <span className="muted">One private repository and 30 days of history.{billing.teamPriceText ? ` Team is ${billing.teamPriceText}.` : ""}</span> <PlanButton url="/api/v1/billing/checkout" account={account} label="Upgrade to Team" />
                </>
              ) : customer !== null ? (
                <PlanButton url="/api/v1/billing/portal" account={account} label="Manage billing" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <h2>Delete your account</h2>
      <p className="muted">Removes your account and every repository space it owns, with their maps, checks and tokens, at once.</p>
      <DeleteButton url="/api/v1/account" label="Delete my account" confirmText="Delete your account and everything it owns now?" then="signout" />
    </main>
  );
}
