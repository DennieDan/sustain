// A repository's settings, for its owners: upload tokens, public maps, and deleting maps or all
// of its data (CLD-02, CLD-03, CLD-11).
import { notFound, redirect } from "next/navigation";
import { DeleteButton, NewToken, PublicToggle } from "../../../../components/Actions";
import { checkAccess } from "../../../../lib/access";
import { services } from "../../../../lib/services";
import { listTokens, mapHistory } from "../../../../lib/store";

export const dynamic = "force-dynamic";

export default async function RepositorySettings({ params }: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo: name } = await params;
  const { db: openDb, github, now, user: currentUser } = services();
  const user = await currentUser();
  if (!user) redirect(`/signin?callbackUrl=${encodeURIComponent(`/settings/${owner}/${name}`)}`);
  const db = await openDb();
  const access = await checkAccess(db, github(), user, owner, name, now());
  if (!access || access.role !== "owner") notFound();
  const api = `/api/v1/repos/${owner}/${name}`;
  const maps = await mapHistory(db, access.repo.id);
  const tokens = await listTokens(db, access.repo.id);
  return (
    <main className="page">
      <h1>
        <a href={`/${owner}/${name}`}>
          {owner}/{name}
        </a>{" "}
        settings
      </h1>
      <h2>Upload tokens</h2>
      <p className="muted">For `sustain.mjs publish` as SUSTAIN_TOKEN. The Action uploads with OIDC and needs none.</p>
      <ul className="tokens">
        {tokens.map((token) => (
          <li key={token.id}>
            {token.name} <span className="muted">created {token.createdAt.toISOString().slice(0, 10)}</span>{" "}
            <DeleteButton url={`${api}/tokens/${token.id}`} label="Revoke" confirmText={`Revoke the token ${token.name}?`} />
          </li>
        ))}
      </ul>
      <NewToken url={`${api}/tokens`} />
      <h2>Visibility</h2>
      <PublicToggle url={`${api}/public`} value={access.repo.publicMaps} allowed={!access.repo.private} />
      {access.repo.private ? <p className="muted">A private repository&apos;s maps stay private.</p> : null}
      <h2>Maps</h2>
      <ul className="maps">
        {maps.map((map) => (
          <li key={map.id}>
            {map.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {map.branch} · {map.commit.slice(0, 7)}{" "}
            <DeleteButton url={`${api}/uploads/${map.id}`} label="Delete" confirmText="Delete this map now?" />
          </li>
        ))}
      </ul>
      <h2>Delete this repository&apos;s data</h2>
      <p className="muted">Removes every map, check and token of this repository at once.</p>
      <DeleteButton url={api} label="Delete all data" confirmText={`Delete all of ${owner}/${name}'s data now?`} then="home" />
    </main>
  );
}
