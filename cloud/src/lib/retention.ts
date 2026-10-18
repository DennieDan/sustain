// CLD-13: the daily job that enforces each plan's history. Uploads older than the plan keeps are
// removed, except the newest map of each repository's default branch, so a quiet repository keeps
// its map.
import { and, desc, eq, lt, ne } from "drizzle-orm";
import type { Database } from "../db/client";
import { repositories, uploads } from "../db/schema";
import { planOfAccount } from "./billing";
import { historySince } from "./store";

/** How often the job runs. */
export const RETENTION_INTERVAL_MS = 86_400_000;

/** Removes the uploads every repository's plan no longer keeps; returns how many went. */
export async function enforceRetention(db: Database, now = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let removed = 0;
  for (const repo of await db.select().from(repositories)) {
    const since = historySince(await planOfAccount(db, repo.owner, env), now);
    if (since === null) continue;
    const [main] = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(eq(uploads.repoId, repo.id), eq(uploads.kind, "map"), eq(uploads.branch, repo.defaultBranch)))
      .orderBy(desc(uploads.createdAt), desc(uploads.id))
      .limit(1);
    const old = and(eq(uploads.repoId, repo.id), lt(uploads.createdAt, since), ...(main === undefined ? [] : [ne(uploads.id, main.id)]));
    removed += (await db.delete(uploads).where(old).returning({ id: uploads.id })).length;
  }
  return removed;
}
