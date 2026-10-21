// FR-CMP-04: comparison context, one test per warning and approximate case; picker tags (FR-CMP-06).
import { describe, expect, test } from "vitest";
import { compareRuns, MAX_HISTORY_STEPS, pickerTags, type RunFacts } from "../../../src/core/comparison";
import type { Lineage, RunMode } from "../../../src/model/lineage";

const REV_A = "a".repeat(40);
const REV_B = "b".repeat(40);
const IDS = ["a", "b", "c", "d"];

function lineage(previousRun: string | null, mode: RunMode = "update", extra: Partial<Lineage> = {}): Lineage {
  return {
    mode,
    reason: "test",
    previousRun,
    baseRevision: null,
    revision: REV_A,
    baseCommit: null,
    headCommit: { subject: "Add a", committedAt: "2026-10-01T10:00:00+08:00" },
    dirty: [],
    dirtyCount: 0,
    updatesSinceRegeneration: 0,
    ...extra,
  };
}

function run(runFolder: string, order: number, runLineage: Lineage | null, extra: Partial<RunFacts> = {}): RunFacts {
  return { runFolder, slug: "app", order, lineage: runLineage, repository: { url: "https://github.com/o/r", revision: REV_B }, componentIds: IDS, ...extra };
}

/** `lineageOf` over a fixed table. */
const lookup =
  (table: Record<string, Lineage>) =>
  (runFolder: string): Lineage | null =>
    table[runFolder] ?? null;

describe("FR-CMP-04 comparison context", () => {
  test("the previous update run: no warnings, kept available, commits from lineage", () => {
    const current = run("r3", 0, lineage("r2", "update", { dirtyCount: 2 }));
    const baseline = run("r2", 1, lineage("r1"));
    const context = compareRuns(current, baseline, lookup({ r2: baseline.lineage! }), true);
    expect(context).toEqual({
      baselineRun: "r2",
      currentRun: "r3",
      warnings: [],
      approximate: false,
      keptAvailable: true,
      keptNote: false,
      baselineCommit: { revision: REV_A, subject: "Add a", committedAt: "2026-10-01T10:00:00+08:00", dirtyCount: 0 },
      currentCommit: { revision: REV_A, subject: "Add a", committedAt: "2026-10-01T10:00:00+08:00", dirtyCount: 2 },
    });
  });

  test("kept is unavailable when changes.json does not parse, and the note shows", () => {
    const context = compareRuns(run("r3", 0, lineage("r2")), run("r2", 1, lineage(null)), lookup({}), false);
    expect(context.keptAvailable).toBe(false);
    expect(context.keptNote).toBe(true);
  });

  test("a regenerate run against its previous run: approximate, no kept data and no note", () => {
    const context = compareRuns(run("r3", 0, lineage("r2", "regenerate")), run("r2", 1, lineage(null)), lookup({}), true);
    expect(context.approximate).toBe(true);
    expect(context.keptAvailable).toBe(false);
    expect(context.keptNote).toBe(false);
    expect(context.warnings).toEqual([]);
  });

  test("an older run in the history: approximate only when a regenerate run lies between", () => {
    const table = { r3: lineage("r2", "regenerate"), r2: lineage("r1"), r1: lineage(null, "regenerate") };
    const current = run("r4", 0, lineage("r3"));
    const viaRegenerate = compareRuns(current, run("r1", 3, table.r1), lookup(table), true);
    expect(viaRegenerate.approximate).toBe(true);
    expect(viaRegenerate.warnings).toEqual([]);
    expect(viaRegenerate.keptAvailable).toBe(false);
    expect(viaRegenerate.keptNote).toBe(true);
    // r1 itself is a regenerate run, but it is the baseline (exclusive).
    const updatesOnly = { r3: lineage("r2"), r2: lineage("r1"), r1: lineage(null, "regenerate") };
    expect(compareRuns(current, run("r1", 3, updatesOnly.r1), lookup(updatesOnly), true).approximate).toBe(false);
  });

  test("different-focus when both slugs are known and differ", () => {
    const context = compareRuns(run("r2", 0, null, { slug: "api" }), run("r1", 1, null, { slug: "web" }), lookup({}), false);
    expect(context.warnings).toEqual([{ code: "different-focus", message: "Different focus: `web` vs `api`." }]);
    expect(compareRuns(run("r2", 0, null, { slug: null }), run("r1", 1, null, { slug: "web" }), lookup({}), false).warnings).toEqual([]);
  });

  test("unrelated when shared IDs ÷ all IDs < 0.3", () => {
    const current = run("r2", 0, null, { componentIds: ["a", "b", "c", "d"] });
    const unrelated = compareRuns(current, run("r1", 1, null, { componentIds: ["a", "x", "y", "z"] }), lookup({}), false);
    expect(unrelated.warnings).toEqual([{ code: "unrelated", message: "Probably unrelated: only 1 of 7 components match." }]);
    // 3 of 10 = 0.3 is not below the threshold.
    const related = compareRuns(
      run("r2", 0, null, { componentIds: ["a", "b", "c", "d", "e", "f"] }),
      run("r1", 1, null, { componentIds: ["a", "b", "c", "x", "y", "z", "w"] }),
      lookup({}),
      false,
    );
    expect(related.warnings).toEqual([]);
  });

  test("different-repository when both URLs are present and differ", () => {
    const context = compareRuns(run("r2", 0, null), run("r1", 1, null, { repository: { url: "https://github.com/o/other", revision: REV_B } }), lookup({}), false);
    expect(context.warnings).toEqual([{ code: "different-repository", message: "Different repository: `https://github.com/o/other`." }]);
    expect(compareRuns(run("r2", 0, null), run("r1", 1, null, { repository: null }), lookup({}), false).warnings).toEqual([]);
  });

  test("outside-history when both runs have a lineage and the baseline is not reachable; approximate", () => {
    const context = compareRuns(run("r3", 0, lineage("r2")), run("x1", 2, lineage(null)), lookup({ r2: lineage(null) }), true);
    expect(context.warnings).toEqual([{ code: "outside-history", message: "Not in this diagram's update history." }]);
    expect(context.approximate).toBe(true);
    expect(context.keptAvailable).toBe(false);
  });

  test("reversed when the baseline is newer in run order", () => {
    const context = compareRuns(run("r1", 1, null), run("r2", 0, null), lookup({}), false);
    expect(context.warnings).toEqual([{ code: "reversed", message: "Baseline is newer than this diagram; changes are shown in reverse." }]);
  });

  test("warnings come in spec order", () => {
    const context = compareRuns(
      run("r1", 1, lineage(null), { slug: "api" }),
      run("r2", 0, lineage(null), { slug: "web", componentIds: ["x"], repository: { url: "https://gitee.com/o/r", revision: REV_B } }),
      lookup({}),
      false,
    );
    expect(context.warnings.map((w) => w.code)).toEqual(["different-focus", "unrelated", "different-repository", "outside-history", "reversed"]);
  });

  test("a cycle in previousRun terminates and the baseline is outside the history", () => {
    const table = { r2: lineage("r1"), r1: lineage("r2") };
    const context = compareRuns(run("r3", 0, lineage("r2")), run("x", 5, lineage(null)), lookup(table), true);
    expect(context.warnings.map((w) => w.code)).toEqual(["outside-history"]);
  });

  test("the history walk stops after MAX_HISTORY_STEPS", () => {
    const lineageOf = (runFolder: string): Lineage => lineage(`r${Number(runFolder.slice(1)) + 1}`);
    const current = run("r0", 0, lineage("r1"));
    expect(compareRuns(current, run(`r${MAX_HISTORY_STEPS}`, 1, lineage(null)), lineageOf, true).warnings).toEqual([]);
    expect(compareRuns(current, run(`r${MAX_HISTORY_STEPS + 1}`, 1, lineage(null)), lineageOf, true).warnings.map((w) => w.code)).toEqual(["outside-history"]);
  });

  test("with no lineages only focus, unrelated, repository and reversed fire; never approximate", () => {
    const context = compareRuns(
      run("architecture-api-x", 1, null, { slug: "api" }),
      run("architecture-web-y", 0, null, { slug: "web", componentIds: ["x"], repository: { url: "https://gitee.com/o/r", revision: REV_A } }),
      lookup({}),
      true,
    );
    expect(context.warnings.map((w) => w.code)).toEqual(["different-focus", "unrelated", "different-repository", "reversed"]);
    expect(context.approximate).toBe(false);
    expect(context.keptAvailable).toBe(false);
    expect(context.keptNote).toBe(true);
    expect(context.baselineCommit).toEqual({ revision: REV_A, subject: null, committedAt: null, dirtyCount: 0 });
  });

  test("commits: repository revision when lineage has none, null when nothing is known", () => {
    const noRevision = run("r2", 0, lineage(null, "update", { revision: null, dirtyCount: 3 }));
    const unknown = run("r1", 1, lineage(null, "update", { revision: null }), { repository: null });
    const context = compareRuns(noRevision, unknown, lookup({}), false);
    expect(context.currentCommit).toEqual({ revision: REV_B, subject: null, committedAt: null, dirtyCount: 3 });
    expect(context.baselineCommit).toBeNull();
  });
});

describe("FR-CMP-06 picker tags", () => {
  test("previous, newer, different focus and outside update history in order", () => {
    const current = run("r3", 1, lineage("r2"));
    const table = { r2: lineage(null) };
    expect(pickerTags(current, run("r2", 2, table.r2), lookup(table))).toEqual(["previous"]);
    expect(pickerTags(current, run("r9", 0, lineage(null), { slug: "web" }), lookup(table))).toEqual(["newer", "different focus", "outside update history"]);
    expect(pickerTags(current, run("r0", 3, null), lookup(table))).toEqual([]);
  });
});
