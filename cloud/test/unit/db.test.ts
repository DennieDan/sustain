// The cloud database migrates once and its tables match the Drizzle schema.
import { eq } from "drizzle-orm";
import { expect, test } from "vitest";
import { openDatabase } from "../../src/db/client";
import { repositories, uploads, users } from "../../src/db/schema";

test("a fresh database takes rows through the schema, and deleting a repository removes its uploads", async () => {
  const db = await openDatabase();
  const [user] = await db.insert(users).values({ githubId: 1, login: "dev" }).returning();
  const [repo] = await db.insert(repositories).values({ githubId: 10, owner: "acme", name: "shop", defaultBranch: "main", private: true }).returning();
  await db.insert(uploads).values({ repoId: repo!.id, kind: "map", commit: "a".repeat(40), branch: "main", payload: { map: {} }, via: "token" });
  expect(user!.login).toBe("dev");
  await db.delete(repositories).where(eq(repositories.id, repo!.id));
  expect(await db.select().from(uploads)).toEqual([]);
});
