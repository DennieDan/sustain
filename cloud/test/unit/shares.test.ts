// CLD-06: a share link opens its repository until it expires or is revoked; only its hash is kept.
import { expect, test } from "vitest";
import { openDatabase } from "../../src/db/client";
import { shareLinks } from "../../src/db/schema";
import { createShare, listShares, openShare, revokeShare } from "../../src/lib/shares";
import { upsertRepository } from "../../src/lib/store";

test("CLD-06 a link opens until it expires or is revoked, and the database holds only its hash", async () => {
  const db = await openDatabase();
  const repo = await upsertRepository(db, { githubId: 1, owner: "acme", name: "shop", private: true });
  const now = new Date("2026-10-19T12:00:00Z");
  const week = await createShare(db, repo.id, 7, null, now);
  const day = await createShare(db, repo.id, 1, null, now);
  expect(week.token).toMatch(/^shr_/);
  expect((await openShare(db, week.token, new Date("2026-10-26T11:59:00Z")))?.repo.name).toBe("shop");
  expect(await openShare(db, week.token, new Date("2026-10-26T12:01:00Z"))).toBeNull();
  expect(await revokeShare(db, repo.id, day.id, now)).toBe(true);
  expect(await openShare(db, day.token, now)).toBeNull();
  expect((await listShares(db, repo.id, now)).map((link) => link.id)).toEqual([week.id]);
  const stored = await db.select().from(shareLinks);
  expect(stored.some((row) => JSON.stringify(row).includes(week.token))).toBe(false);
});
