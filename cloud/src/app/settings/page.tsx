// The account: organizations, repository spaces and roles, and deleting the account (CLD-01, CLD-11).
import { redirect } from "next/navigation";
import { DeleteButton } from "../../components/Actions";
import { organizationsOf, spacesOf } from "../../lib/access";
import { services } from "../../lib/services";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await services().user();
  if (!user) redirect("/signin?callbackUrl=/settings");
  const db = await services().db();
  const orgs = await organizationsOf(db, user.userId);
  const spaces = await spacesOf(db, user.userId);
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
      <h2>Delete your account</h2>
      <p className="muted">Removes your account and every repository space it owns, with their maps, checks and tokens, at once.</p>
      <DeleteButton url="/api/v1/account" label="Delete my account" confirmText="Delete your account and everything it owns now?" then="signout" />
    </main>
  );
}
