// CLD-05: the team dashboard aggregates each repository's main map and checks, and nothing it, or
// anything the cloud stores, describes a person.
import { beforeEach, expect, test } from "vitest";
import { openDatabase, type Database } from "../../src/db/client";
import { uploads } from "../../src/db/schema";
import { dashboardRepo } from "../../src/lib/dashboard";
import { saveUpload, upsertRepository, type Repository } from "../../src/lib/store";
import { UPLOAD_SCHEMA } from "../../../src/model/upload";
import { COMMIT, MAP } from "../support/fixtures";

const NOW = new Date("2026-10-19T12:00:00Z");
let db: Database;
let repo: Repository;

beforeEach(async () => {
  db = await openDatabase();
  repo = await upsertRepository(db, { githubId: 1, owner: "acme", name: "shop", private: true, defaultBranch: "main" });
});

function check(fields: { stale?: number; uncovered?: string[]; violations?: number; touched?: string[]; result?: "pass" | "fail"; base?: string }): Record<string, unknown> {
  return {
    map: "architecture-shop-20261018-120000",
    base: fields.base ?? "origin/main",
    head: "HEAD",
    mergeBase: COMMIT,
    touched: { strong: (fields.touched ?? []).map((label) => ({ id: label.toLowerCase(), label })), weak: [] },
    stale: Array.from({ length: fields.stale ?? 0 }, (_, index) => ({ id: `s${index}`, label: `S${index}`, state: "edited" })),
    uncovered: fields.uncovered ?? [],
    candidates: [],
    gone: [],
    arrows: [],
    violations: Array.from({ length: fields.violations ?? 0 }, () => ({ rule: "r", kind: "forbid", reason: "x", file: "a.ts", line: 1, imported: "b.ts" })),
    result: fields.result ?? "pass",
    reasons: [],
  };
}

async function save(kind: "map" | "check", at: string, fields: { pull?: number; branch?: string; payload: Record<string, unknown> }): Promise<void> {
  await saveUpload(db, { repoId: repo.id, kind, commit: COMMIT, branch: fields.branch ?? "main", pull: fields.pull ?? null, payload: fields.payload, via: "oidc", createdAt: new Date(at) } as typeof uploads.$inferInsert);
}

test("CLD-05 a repository's row gives its main map, the latest check's figures, the trend, the hotspots and recent pull requests", async () => {
  await save("map", "2026-10-15T12:00:00Z", { payload: { map: MAP } });
  await save("check", "2026-10-16T12:00:00Z", { pull: 3, branch: "feature-a", payload: { check: check({ stale: 3, uncovered: ["a.ts", "b.ts"], touched: ["Retriever", "LLM"] }) } });
  await save("check", "2026-10-17T12:00:00Z", { pull: 3, branch: "feature-a", payload: { check: check({ stale: 2, uncovered: ["a.ts"], touched: ["Retriever"] }) } });
  await save("check", "2026-10-18T12:00:00Z", { pull: 4, branch: "feature-b", payload: { check: check({ stale: 1, uncovered: [], violations: 2, touched: ["Retriever"], result: "fail" }) } });
  await save("check", "2026-10-18T13:00:00Z", { pull: 5, branch: "release", payload: { check: check({ stale: 9, base: "origin/release", touched: ["Store"] }) } });
  const row = await dashboardRepo(db, repo, NOW);
  expect(row).toEqual({
    owner: "acme",
    name: "shop",
    private: true,
    mapAt: "2026-10-15T12:00:00.000Z",
    boxes: (MAP["components"] as unknown[]).length,
    stale: 1,
    uncovered: 0,
    violations: 2,
    hotspots: [
      { label: "Retriever", pulls: 2 },
      { label: "Store", pulls: 1 },
    ],
    trend: [
      { at: "2026-10-16T12:00:00.000Z", stale: 3, uncovered: 2 },
      { at: "2026-10-17T12:00:00.000Z", stale: 2, uncovered: 1 },
      { at: "2026-10-18T12:00:00.000Z", stale: 1, uncovered: 0 },
    ],
    pulls: [
      { number: 5, at: "2026-10-18T13:00:00.000Z", result: "pass", boxes: ["Store"] },
      { number: 4, at: "2026-10-18T12:00:00.000Z", result: "fail", boxes: ["Retriever"] },
      { number: 3, at: "2026-10-17T12:00:00.000Z", result: "pass", boxes: ["Retriever"] },
    ],
  });
});

/** Every key of `value`, at any depth. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]);
}

const PERSON = /^(authors?|committers?|emails?|logins?|users?|userId|createdBy|reviewers?|assignees?)$/i;

test("CLD-05 no route can return author-level data: the dashboard names no person, and no stored map or check has a field for one", async () => {
  await save("map", "2026-10-15T12:00:00Z", { payload: { map: MAP } });
  await save("check", "2026-10-16T12:00:00Z", { pull: 3, branch: "feature-a", payload: { check: check({ stale: 1, touched: ["Retriever"] }) } });
  expect(keysOf(await dashboardRepo(db, repo, NOW)).filter((key) => PERSON.test(key))).toEqual([]);
  // Uploads are the cloud's only data about repositories, and the closed schema refuses every field it does not list.
  const properties = (schema: unknown): string[] => {
    if (Array.isArray(schema)) return schema.flatMap(properties);
    if (typeof schema !== "object" || schema === null) return [];
    const own = Object.keys((schema as { properties?: object }).properties ?? {});
    return [...own, ...Object.values(schema).flatMap(properties)];
  };
  expect(properties(UPLOAD_SCHEMA).filter((key) => PERSON.test(key))).toEqual([]);
});
