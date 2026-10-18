// CLD-04: a pull request's latest check on the map: touched boxes, new box candidates as ghosts,
// and stale boxes, with the counts beside it.
import { notFound, redirect } from "next/navigation";
import { MapViewer } from "../../../../../components/MapViewer";
import { checkOf, mapOf, mapPageData } from "../../../../../lib/mapPage";
import { planOfAccount } from "../../../../../lib/billing";
import { openSpace } from "../../../../../lib/pages";
import { services } from "../../../../../lib/services";
import { latestCheck, mainMap } from "../../../../../lib/store";

export const dynamic = "force-dynamic";

export default async function PullPage({ params }: { params: Promise<{ owner: string; repo: string; n: string }> }) {
  const { owner, repo: name, n } = await params;
  const pull = Number(n);
  if (!Number.isInteger(pull) || pull < 1) notFound();
  const space = await openSpace(owner, name);
  if (space === "sign-in") redirect(`/signin?callbackUrl=${encodeURIComponent(`/${owner}/${name}/pull/${pull}`)}`);
  if (space === "not-found") notFound();
  const db = await services().db();
  // CLD-07: pull request pages come with the Team plan.
  const plan = await planOfAccount(db, owner);
  if (!plan.pullPages) {
    return (
      <main className="page">
        <h1>
          {owner}/{name} #{pull}
        </h1>
        <p className="muted plan-note">Pull request pages come with the Team plan. {owner} is on {plan.label}.</p>
      </main>
    );
  }
  const check = await latestCheck(db, space.repo, pull);
  const report = checkOf(check);
  const map = mapOf(check) !== null ? check : await mainMap(db, space.repo);
  if (!check || !report || !map) {
    return (
      <main className="page">
        <h1>
          {owner}/{name} #{pull}
        </h1>
        <p className="muted">No check uploaded for this pull request yet.</p>
      </main>
    );
  }
  const touched = report.touched.strong.length + report.touched.weak.length;
  return (
    <>
      <MapViewer data={mapPageData(space.repo, map, check, pull)} />
      <aside className="map-side" aria-label="Check">
        <h2>
          {owner}/{name} #{pull}: {report.result}
        </h2>
        <ul className="counts">
          <li>{touched} touched</li>
          <li>{report.candidates.length} new box candidates</li>
          <li>{report.stale.length} stale</li>
          <li>{report.gone.length} gone</li>
          <li>{report.uncovered.length} files not on the map</li>
        </ul>
        {report.candidates.length > 0 ? (
          <>
            <h2>New box candidates</h2>
            <ul>
              {report.candidates.map((candidate) => (
                <li key={candidate.dir}>
                  <code>{candidate.dir}/</code>: {candidate.files.length} files, {candidate.lines} lines
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="muted">
          Checked {check.commit.slice(0, 7)} · <a href={`/${owner}/${name}`}>Main map</a>
        </p>
      </aside>
    </>
  );
}
