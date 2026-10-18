// Sustain Cloud's queries: repositories, uploads, tokens, access and deletion.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Plan } from "../../plans";
import type { Database } from "../db/client";
import { access, memberships, repositories, tokens, uploads, users } from "../db/schema";
import { hashToken } from "./tokens";

export type Repository = typeof repositories.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;

/** Uploads one repository may make per hour. */
export const UPLOADS_PER_HOUR = 60;

export async function findRepository(db: Database, owner: string, name: string): Promise<Repository | undefined> {
  const [row] = await db.select().from(repositories).where(and(eq(repositories.owner, owner), eq(repositories.name, name)));
  return row;
}

/** The repository with GitHub id `githubId`, created or updated with what is known now. */
export async function upsertRepository(db: Database, facts: { githubId: number; owner: string; name: string; private: boolean; defaultBranch?: string }): Promise<Repository> {
  const [row] = await db
    .insert(repositories)
    .values({ githubId: facts.githubId, owner: facts.owner, name: facts.name, private: facts.private, defaultBranch: facts.defaultBranch ?? "main" })
    .onConflictDoUpdate({
      target: repositories.githubId,
      set: { owner: facts.owner, name: facts.name, private: facts.private, ...(facts.defaultBranch ? { defaultBranch: facts.defaultBranch } : {}) },
    })
    .returning();
  if (facts.private) await db.update(repositories).set({ publicMaps: false }).where(eq(repositories.id, row!.id));
  return row!;
}

/** The repository an upload token belongs to and the token's id, recording its use. */
export async function repositoryForToken(db: Database, token: string): Promise<{ repo: Repository; tokenId: number } | undefined> {
  const [row] = await db.select({ repo: repositories, tokenId: tokens.id }).from(tokens).innerJoin(repositories, eq(tokens.repoId, repositories.id)).where(eq(tokens.hash, hashToken(token)));
  if (!row) return undefined;
  await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, row.tokenId));
  return row;
}

export async function createTokenRecord(db: Database, repoId: number, name: string, token: string, createdBy: number | null): Promise<number> {
  const [row] = await db.insert(tokens).values({ repoId, name, hash: hashToken(token), createdBy }).returning({ id: tokens.id });
  return row!.id;
}

export async function uploadsInLastHour(db: Database, repoId: number, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(uploads)
    .where(and(eq(uploads.repoId, repoId), gte(uploads.createdAt, new Date(now.getTime() - 3_600_000))));
  return row?.count ?? 0;
}

export async function saveUpload(db: Database, row: typeof uploads.$inferInsert): Promise<UploadRow> {
  const [saved] = await db.insert(uploads).values(row).returning();
  return saved!;
}

/** The main map: the latest map uploaded from the default branch. */
export async function mainMap(db: Database, repo: Repository): Promise<UploadRow | undefined> {
  const [row] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.repoId, repo.id), eq(uploads.kind, "map"), eq(uploads.branch, repo.defaultBranch)))
    .orderBy(desc(uploads.createdAt), desc(uploads.id))
    .limit(1);
  return row;
}

/** The repository's maps, newest first; with `since`, only those uploaded from then on (CLD-07). */
export async function mapHistory(db: Database, repoId: number, since: Date | null = null): Promise<UploadRow[]> {
  const kept = since === null ? and(eq(uploads.repoId, repoId), eq(uploads.kind, "map")) : and(eq(uploads.repoId, repoId), eq(uploads.kind, "map"), gte(uploads.createdAt, since));
  return db.select().from(uploads).where(kept).orderBy(desc(uploads.createdAt), desc(uploads.id));
}

/** CLD-07: the oldest upload time `plan` keeps, or `null` when it keeps all history. */
export function historySince(plan: Plan, now: Date): Date | null {
  return plan.historyDays === null ? null : new Date(now.getTime() - plan.historyDays * 86_400_000);
}

/** The latest check, of a pull request when `pull` is given, else of the default branch. */
export async function latestCheck(db: Database, repo: Repository, pull?: number): Promise<UploadRow | undefined> {
  const where = pull === undefined ? and(eq(uploads.repoId, repo.id), eq(uploads.kind, "check"), eq(uploads.branch, repo.defaultBranch)) : and(eq(uploads.repoId, repo.id), eq(uploads.kind, "check"), eq(uploads.pull, pull));
  const [row] = await db.select().from(uploads).where(where).orderBy(desc(uploads.createdAt), desc(uploads.id)).limit(1);
  return row;
}

export async function roleOf(db: Database, userId: number, repoId: number): Promise<"viewer" | "member" | "owner" | undefined> {
  const [row] = await db.select({ role: access.role }).from(access).where(and(eq(access.userId, userId), eq(access.repoId, repoId)));
  return row?.role;
}

export async function findUserByGithubId(db: Database, githubId: number): Promise<typeof users.$inferSelect | undefined> {
  const [row] = await db.select().from(users).where(eq(users.githubId, githubId));
  return row;
}

export async function listTokens(db: Database, repoId: number): Promise<{ id: number; name: string; createdAt: Date; lastUsedAt: Date | null }[]> {
  return db.select({ id: tokens.id, name: tokens.name, createdAt: tokens.createdAt, lastUsedAt: tokens.lastUsedAt }).from(tokens).where(eq(tokens.repoId, repoId)).orderBy(tokens.id);
}

export async function revokeToken(db: Database, repoId: number, id: number): Promise<boolean> {
  return (await db.delete(tokens).where(and(eq(tokens.repoId, repoId), eq(tokens.id, id))).returning({ id: tokens.id })).length > 0;
}

/** Makes a public repository's maps public or private again; a private repository's maps stay private. */
export async function setPublicMaps(db: Database, repo: Repository, value: boolean): Promise<boolean> {
  if (value && repo.private) return false;
  await db.update(repositories).set({ publicMaps: value }).where(eq(repositories.id, repo.id));
  return true;
}

/** CLD-11: one upload, gone at once. */
export async function deleteUpload(db: Database, repoId: number, id: number): Promise<boolean> {
  return (await db.delete(uploads).where(and(eq(uploads.repoId, repoId), eq(uploads.id, id))).returning({ id: uploads.id })).length > 0;
}

/** CLD-11: a repository's uploads, checks, tokens and access, gone at once. */
export async function deleteRepositoryData(db: Database, repoId: number): Promise<void> {
  await db.delete(repositories).where(eq(repositories.id, repoId));
}

/** CLD-11: the user, their access and memberships, and every repository space their account owns. */
export async function deleteAccount(db: Database, userId: number, login: string): Promise<void> {
  await db.delete(repositories).where(eq(repositories.owner, login));
  await db.delete(memberships).where(eq(memberships.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

/** CLD-13: entries of the audit log, newest first. */
export const AUDIT_ENTRIES = 50;

/** CLD-13: the repository's latest uploads, each with how it was signed, its time and its size. */
export async function auditLog(db: Database, repoId: number): Promise<{ id: number; kind: "map" | "check"; via: string; size: number | null; createdAt: Date }[]> {
  const signer = alias(tokens, "signer");
  const rows = await db
    .select({ id: uploads.id, kind: uploads.kind, via: uploads.via, token: signer.name, size: uploads.size, createdAt: uploads.createdAt, owner: repositories.owner, name: repositories.name })
    .from(uploads)
    .innerJoin(repositories, eq(uploads.repoId, repositories.id))
    .leftJoin(signer, eq(uploads.tokenId, signer.id))
    .where(eq(uploads.repoId, repoId))
    .orderBy(desc(uploads.createdAt), desc(uploads.id))
    .limit(AUDIT_ENTRIES);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    via: row.via === "oidc" ? `GitHub Actions OIDC for ${row.owner}/${row.name}` : row.token === null ? "an upload token since revoked" : `the upload token ${row.token}`,
    size: row.size,
    createdAt: row.createdAt,
  }));
}
