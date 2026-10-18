// CLD-06: read-only links to a repository's main map that expire after 1, 7 or 30 days and can be
// revoked. Only the link's SHA-256 is stored; the link itself is shown once, when it is made.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { repositories, shareLinks } from "../db/schema";
import type { Repository } from "./store";
import { hashToken, newShareToken } from "./tokens";

/** How long a link may last, in days. */
export const SHARE_DAYS = [1, 7, 30] as const;
export type ShareDays = (typeof SHARE_DAYS)[number];

export interface ShareLink {
  id: number;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Makes a link to `repoId`'s map that lasts `days`; returns its token, shown once. */
export async function createShare(db: Database, repoId: number, days: ShareDays, createdBy: number | null, now = new Date()): Promise<{ id: number; token: string; expiresAt: Date }> {
  const token = newShareToken();
  const expiresAt = new Date(now.getTime() + days * 86_400_000);
  const [row] = await db.insert(shareLinks).values({ repoId, hash: hashToken(token), expiresAt, createdBy, createdAt: now }).returning({ id: shareLinks.id });
  return { id: row!.id, token, expiresAt };
}

/** `repoId`'s links that still open, newest first. */
export async function listShares(db: Database, repoId: number, now = new Date()): Promise<ShareLink[]> {
  return db
    .select({ id: shareLinks.id, expiresAt: shareLinks.expiresAt, revokedAt: shareLinks.revokedAt, createdAt: shareLinks.createdAt })
    .from(shareLinks)
    .where(and(eq(shareLinks.repoId, repoId), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, now)))
    .orderBy(desc(shareLinks.createdAt), desc(shareLinks.id));
}

/** Revokes link `id` of `repoId` at once. */
export async function revokeShare(db: Database, repoId: number, id: number, now = new Date()): Promise<boolean> {
  return (await db.update(shareLinks).set({ revokedAt: now }).where(and(eq(shareLinks.repoId, repoId), eq(shareLinks.id, id), isNull(shareLinks.revokedAt))).returning({ id: shareLinks.id })).length > 0;
}

/** The repository a link opens and when it expires, or `null` for a link unknown, expired or revoked. */
export async function openShare(db: Database, token: string, now = new Date()): Promise<{ repo: Repository; expiresAt: Date } | null> {
  const [row] = await db
    .select({ repo: repositories, expiresAt: shareLinks.expiresAt })
    .from(shareLinks)
    .innerJoin(repositories, eq(shareLinks.repoId, repositories.id))
    .where(and(eq(shareLinks.hash, hashToken(token)), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, now)));
  return row ?? null;
}
