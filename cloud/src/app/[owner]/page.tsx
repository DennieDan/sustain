// CLD-05: the team dashboard. One row per repository of the account the viewer can see: the main
// map's age, its freshness, uncovered files and open violations from the latest check, the boxes
// pull requests touch most, a trend over recent checks, and recent pull requests. Nothing is per person.
import { redirect } from "next/navigation";
import { relativeAge } from "../../../../src/model/home";
import { planOfAccount } from "../../lib/billing";
import { dashboardFor, TREND_CHECKS, type DashboardRepo } from "../../lib/dashboard";
import { services } from "../../lib/services";

export const dynamic = "force-dynamic";

function figure(value: number | null): string {
  return value === null ? "—" : String(value);
}

function Row({ repo, now }: { repo: DashboardRepo; now: Date }) {
  const path = `/${repo.owner}/${repo.name}`;
  return (
    <tr>
      <th scope="row">
        <a href={path}>{repo.name}</a>
        {repo.private ? <span className="muted"> · private</span> : null}
      </th>
      <td>{repo.mapAt === null ? <span className="muted">No map</span> : `${relativeAge(repo.mapAt, now)}${repo.boxes === null ? "" : ` · ${repo.boxes} boxes`}`}</td>
      <td>{figure(repo.stale)}</td>
      <td>{figure(repo.uncovered)}</td>
      <td>{figure(repo.violations)}</td>
      <td>{repo.hotspots.length === 0 ? <span className="muted">—</span> : repo.hotspots.map((box) => `${box.label} (${box.pulls})`).join(", ")}</td>
      <td aria-label={`Stale boxes over the last ${repo.trend.length} checks`}>{repo.trend.length === 0 ? <span className="muted">—</span> : repo.trend.map((point) => point.stale).join(" → ")}</td>
      <td>
        {repo.pulls.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          <ul className="dashboard__pulls">
            {repo.pulls.map((pull) => (
              <li key={pull.number}>
                <a href={`${path}/pull/${pull.number}`}>#{pull.number}</a> {pull.result === "fail" ? "fails" : "passes"}
                {pull.boxes.length > 0 ? ` · ${pull.boxes.join(", ")}` : ""}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const { db: openDb, github, now: clock, user: currentUser } = services();
  const user = await currentUser();
  if (user === null) redirect(`/signin?callbackUrl=${encodeURIComponent(`/${owner}`)}`);
  const now = clock();
  const db = await openDb();
  // CLD-07: the dashboard comes with the Team plan.
  const plan = await planOfAccount(db, owner);
  if (!plan.dashboard) {
    return (
      <main className="page">
        <h1>{owner}</h1>
        <p className="muted plan-note">The team dashboard comes with the Team plan. {owner} is on {plan.label}.</p>
      </main>
    );
  }
  const rows = await dashboardFor(db, github(), user, owner, now);
  return (
    <main className="page page--wide">
      <h1>{owner}</h1>
      {rows.length === 0 ? (
        <p className="muted">No repository of {owner} that you can see has a map in Sustain Cloud yet.</p>
      ) : (
        <table className="dashboard">
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Main map</th>
              <th scope="col">Stale boxes</th>
              <th scope="col">Uncovered files</th>
              <th scope="col">Violations</th>
              <th scope="col">Most changed</th>
              <th scope="col">Stale, last {TREND_CHECKS} checks</th>
              <th scope="col">Recent pull requests</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((repo) => (
              <Row key={repo.name} repo={repo} now={now} />
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
