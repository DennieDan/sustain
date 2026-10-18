// CLD-06: a share link's read-only view of the repository's main map, until it expires or is revoked.
import { notFound } from "next/navigation";
import { MapViewer } from "../../../components/MapViewer";
import { mapPageData } from "../../../lib/mapPage";
import { services } from "../../../lib/services";
import { openShare } from "../../../lib/shares";
import { latestCheck, mainMap } from "../../../lib/store";

export const dynamic = "force-dynamic";

export default async function SharedMapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { db: openDb, now } = services();
  const db = await openDb();
  const shared = await openShare(db, token, now());
  if (shared === null) notFound();
  const map = await mainMap(db, shared.repo);
  const { owner, name } = shared.repo;
  if (!map) {
    return (
      <main className="page">
        <h1>
          {owner}/{name}
        </h1>
        <p className="muted">No map from {shared.repo.defaultBranch} yet.</p>
      </main>
    );
  }
  return (
    <>
      <MapViewer data={mapPageData(shared.repo, map, await latestCheck(db, shared.repo))} />
      <aside className="map-side" aria-label="Shared map">
        <h2>
          {owner}/{name}
        </h2>
        <p className="muted shared-note">
          A read-only link to the map of {map.branch} at {map.commit.slice(0, 7)}. It expires on {shared.expiresAt.toISOString().slice(0, 10)}.
        </p>
      </aside>
    </>
  );
}
