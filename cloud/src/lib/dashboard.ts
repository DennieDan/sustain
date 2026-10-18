// CLD-05: the team dashboard at /<org>. Every figure is per repository, from its main map and its
// checks: nothing here reads or returns who wrote, pushed or reviewed anything.
import { and, asc, desc, eq, gte } from "drizzle-orm";
import type { CheckReport } from "../../../src/model/check";
import type { Database } from "../db/client";
import { repositories, uploads } from "../db/schema";
import { checkAccess, type SignedIn } from "./access";
import type { GitHubApi } from "./github";
import { mapOf } from "./mapPage";
import { mainMap, type Repository, type UploadRow } from "./store";

/** Checks a trend covers, newest last. */
export const TREND_CHECKS = 10;
/** Pull requests listed per repository. */
export const RECENT_PULLS = 5;
/** Boxes listed as hotspots per repository. */
export const HOTSPOT_BOXES = 3;
/** How far back pull requests count towards the hotspots. */
export const HOTSPOT_DAYS = 90;

export interface DashboardRepo {
  owner: string;
  name: string;
  private: boolean;
  /** When the main map was uploaded, or `null` without one. */
  mapAt: string | null;
  boxes: number | null;
  /** From the latest check against the default branch, or `null` without one. */
  stale: number | null;
  uncovered: number | null;
  violations: number | null;
  /** The boxes pull requests touched most over the last {@link HOTSPOT_DAYS} days. */
  hotspots: { label: string; pulls: number }[];
  /** Stale boxes and uncovered files in each of the last checks against the default branch, oldest first. */
  trend: { at: string; stale: number; uncovered: number }[];
  /** The latest check of each recent pull request, with the boxes it touched. */
  pulls: { number: number; at: string; result: "pass" | "fail"; boxes: string[] }[];
}

function reportOf(row: UploadRow): CheckReport | null {
  const check = (row.payload as { check?: CheckReport }).check;
  return check && Array.isArray(check.stale) && Array.isArray(check.uncovered) ? check : null;
}

/** Whether a check compares with the default branch: run on it, or a pull request into it. */
function againstDefault(row: UploadRow, report: CheckReport, defaultBranch: string): boolean {
  return row.branch === defaultBranch || report.base === defaultBranch || report.base.endsWith(`/${defaultBranch}`);
}

/** One repository's row of the dashboard. */
export async function dashboardRepo(db: Database, repo: Repository, now = new Date()): Promise<DashboardRepo> {
  const main = await mainMap(db, repo);
  const components = mapOf(main)?.components;
  const checks = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.repoId, repo.id), eq(uploads.kind, "check"), gte(uploads.createdAt, new Date(now.getTime() - HOTSPOT_DAYS * 86_400_000))))
    .orderBy(desc(uploads.createdAt), desc(uploads.id));
  const reports = checks.flatMap((row) => {
    const report = reportOf(row);
    return report === null ? [] : [{ row, report }];
  });
  const toDefault = reports.filter(({ row, report }) => againstDefault(row, report, repo.defaultBranch));
  const latest = toDefault[0]?.report;

  const latestPerPull = new Map<number, (typeof reports)[number]>();
  for (const entry of reports) if (entry.row.pull !== null && !latestPerPull.has(entry.row.pull)) latestPerPull.set(entry.row.pull, entry);
  const touches = new Map<string, number>();
  for (const { report } of latestPerPull.values()) {
    for (const box of new Set(report.touched.strong.map((touched) => touched.label))) touches.set(box, (touches.get(box) ?? 0) + 1);
  }

  return {
    owner: repo.owner,
    name: repo.name,
    private: repo.private,
    mapAt: main?.createdAt.toISOString() ?? null,
    boxes: Array.isArray(components) ? components.length : null,
    stale: latest === undefined ? null : latest.stale.length + latest.gone.length,
    uncovered: latest === undefined ? null : latest.uncovered.length,
    violations: latest === undefined ? null : (latest.violations?.length ?? 0),
    hotspots: [...touches.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, HOTSPOT_BOXES)
      .map(([label, pulls]) => ({ label, pulls })),
    trend: toDefault
      .slice(0, TREND_CHECKS)
      .reverse()
      .map(({ row, report }) => ({ at: row.createdAt.toISOString(), stale: report.stale.length + report.gone.length, uncovered: report.uncovered.length })),
    pulls: [...latestPerPull.entries()].slice(0, RECENT_PULLS).map(([number, { row, report }]) => ({ number, at: row.createdAt.toISOString(), result: report.result, boxes: report.touched.strong.map((box) => box.label) })),
  };
}

/** The dashboard of `owner`: a row for each of its repositories the user can see on GitHub. */
export async function dashboardFor(db: Database, github: GitHubApi, user: SignedIn, owner: string, now = new Date()): Promise<DashboardRepo[]> {
  const known = await db.select().from(repositories).where(eq(repositories.owner, owner)).orderBy(asc(repositories.name));
  const rows: DashboardRepo[] = [];
  for (const repo of known) {
    const seen = await checkAccess(db, github, user, owner, repo.name, now);
    if (seen !== null) rows.push(await dashboardRepo(db, seen.repo, now));
  }
  return rows;
}
