// CLD-03: a repository's main map, the latest uploaded from its default branch, with freshness from
// the latest check and the history of maps. `?map=<id>` shows an earlier one, and `?compare=<id>`
// draws what changed since another (FRS-07).
import { notFound, redirect } from "next/navigation";
import { MapViewer } from "../../../components/MapViewer";
import { mapName, mapPageData } from "../../../lib/mapPage";
import { openSpace } from "../../../lib/pages";
import { services } from "../../../lib/services";
import { planOfAccount } from "../../../lib/billing";
import { historySince, latestCheck, mainMap, mapHistory } from "../../../lib/store";

export const dynamic = "force-dynamic";

export default async function MapPage({ params, searchParams }: { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ map?: string; compare?: string }> }) {
  const { owner, repo: name } = await params;
  const { map: chosen, compare } = await searchParams;
  const space = await openSpace(owner, name);
  if (space === "sign-in") redirect(`/signin?callbackUrl=${encodeURIComponent(`/${owner}/${name}`)}`);
  if (space === "not-found") notFound();
  const db = await services().db();
  // CLD-07: the account's plan decides how much history shows.
  const history = await mapHistory(db, space.repo.id, historySince(await planOfAccount(db, owner), services().now()));
  const shown = chosen === undefined ? await mainMap(db, space.repo) : history.find((row) => String(row.id) === chosen);
  if (!shown) {
    return (
      <main className="page">
        <h1>
          {owner}/{name}
        </h1>
        <p className="muted">No map from {space.repo.defaultBranch} yet. Upload one with the Sustain Action or `sustain.mjs publish`.</p>
      </main>
    );
  }
  const check = await latestCheck(db, space.repo);
  const against = compare === undefined ? undefined : history.find((row) => String(row.id) === compare && row.id !== shown.id);
  const here = (query: Record<string, number>): string => `/${owner}/${name}?${new URLSearchParams(Object.entries({ ...(chosen === undefined ? {} : { map: chosen }), ...query }).map(([key, value]) => [key, String(value)])).toString()}`;
  return (
    <>
      <MapViewer data={mapPageData(space.repo, shown, check, undefined, against)} />
      <aside className="map-side" aria-label="Map history">
        <h2>
          {owner}/{name}
        </h2>
        <p className="muted">
          Map of {shown.branch} at {shown.commit.slice(0, 7)}
          {space.role === "owner" ? (
            <>
              {" · "}
              <a href={`/settings/${owner}/${name}`}>Settings</a>
            </>
          ) : null}
        </p>
        <h2>History</h2>
        <ol className="history">
          {history.map((row) => (
            <li key={row.id}>
              <a href={`/${owner}/${name}?map=${row.id}`}>
                {row.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {row.branch} · {row.commit.slice(0, 7)}
              </a>
              {row.id === shown.id ? null : (
                <>
                  {" · "}
                  <a href={here({ compare: row.id })} aria-label={`Compare with ${mapName(row)}`}>
                    Compare
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
      </aside>
    </>
  );
}
