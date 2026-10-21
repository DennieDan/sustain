// FR-CMP-05, FR-CMP-06: the default baseline, the compare payload and the Compare with… items.
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildCompare, defaultBaseline, NO_COMPARISON, pickerItems, runFolderOf } from "../../../src/vscode/baseline";
import { put, tempDir } from "../support/temp";

const C = "architecture-shop-20261012-120000";
const B = "architecture-shop-20261011-120000";
const A = "architecture-shop-20261010-120000";
const X = "architecture-other-20261009-120000";
const D = "architecture-shop-20261008-120000";
const BROKEN = "architecture-shop-20261007-120000";

const HASH_C = "c".repeat(40);
const HASH_B = "b".repeat(40);
const HASH_A = "a1b2c3d4e5".repeat(4);

function lineage(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    mode: "update",
    reason: "test",
    previousRun: null,
    baseRevision: null,
    revision: null,
    baseCommit: null,
    headCommit: null,
    dirty: [],
    dirtyCount: 0,
    updatesSinceRegeneration: 0,
    ...overrides,
  });
}

function diagram(meta: Record<string, unknown>, ids = ["web", "api"]): string {
  return JSON.stringify({ meta, components: ids.map((id) => ({ id, type: "backend", label: id.toUpperCase(), sources: [{ path: `src/${id}.ts` }] })) });
}

const CHANGES = {
  baseRevision: HASH_B,
  revision: HASH_C,
  touchedComponents: [{ id: "api", files: [{ status: "M", path: "src/api.ts" }] }],
  uncited: [{ status: "A", path: "README.md" }],
};

/**
 * Newest first: C (update of B, with changes.json), B (regenerate of A), A (no lineage, a
 * repository revision), X (other focus, no title), D (lineage outside C's history), BROKEN.
 */
function repo(): { root: string; file: (run: string) => string } {
  const root = join(tempDir(), "repo");
  const file = (run: string): string => join(root, ".archify", run, "candidate.sir");
  put(root, `.archify/${C}/candidate.sir`, diagram({ title: "Shop C" }));
  put(root, `.archify/${C}/lineage.json`, lineage({ previousRun: B, baseRevision: HASH_B, revision: HASH_C, headCommit: { subject: "Add cart", committedAt: "2026-10-12T12:00:00+08:00" } }));
  put(root, `.archify/${C}/changes.json`, JSON.stringify(CHANGES));
  put(root, `.archify/${B}/candidate.sir`, diagram({ title: "Shop B" }));
  put(root, `.archify/${B}/lineage.json`, lineage({ mode: "regenerate", previousRun: A, revision: HASH_B, headCommit: { subject: "Split API", committedAt: "2026-10-11T12:00:00+08:00" } }));
  put(root, `.archify/${A}/candidate.sir`, diagram({ title: "Shop A", repository: { url: "https://example.com/shop", revision: HASH_A } }));
  put(root, `.archify/${X}/candidate.sir`, diagram({}, ["queue"]));
  put(root, `.archify/${D}/candidate.sir`, diagram({ title: "Shop D" }));
  put(root, `.archify/${D}/lineage.json`, lineage({ mode: "regenerate" }));
  put(root, `.archify/${BROKEN}/candidate.sir`, "{ not json");
  return { root, file };
}

describe("FR-CMP-05 default baseline", () => {
  test("a run with a lineage defaults to its previous run's candidate", () => {
    const { root, file } = repo();
    expect(defaultBaseline(root, file(C))).toBe(file(B));
    expect(defaultBaseline(root, file(B))).toBe(file(A));
  });

  test("a run without a lineage has no baseline", () => {
    const { root, file } = repo();
    expect(defaultBaseline(root, file(A))).toBeNull();
    expect(defaultBaseline(root, file(D))).toBeNull();
  });

  test.each([
    ["a missing run folder", "architecture-shop-20261001-120000"],
    ["an unparseable candidate", BROKEN],
    ["a path instead of a folder name", `../${B}`],
    ["the run itself", C],
  ])("a previousRun naming %s gives no baseline", (_case, previousRun) => {
    const { root, file } = repo();
    put(root, `.archify/${C}/lineage.json`, lineage({ previousRun }));
    expect(defaultBaseline(root, file(C))).toBeNull();
  });

  test("a file outside .archify has no default baseline", () => {
    const { root } = repo();
    const browsed = put(root, "docs/candidate.sir", diagram({ title: "Browsed" }));
    put(root, "docs/lineage.json", lineage({ previousRun: B }));
    expect(defaultBaseline(root, browsed)).toBeNull();
  });

  test("runFolderOf names candidates by run folder and other files by base name", () => {
    const { root, file } = repo();
    expect(runFolderOf(file(C))).toBe(C);
    expect(runFolderOf(join(root, "docs", "arch.json"))).toBe("arch.json");
  });
});

describe("FR-CMP-05 compare payload", () => {
  test("the previous update run carries the baseline doc, the context and changes.json", () => {
    const { root, file } = repo();
    const compare = buildCompare(root, file(C), file(B));
    expect(compare).not.toBeNull();
    expect(compare!.baselineFile).toBe(file(B));
    expect(compare!.baselineDoc).toEqual(JSON.parse(diagram({ title: "Shop B" })));
    expect(compare!.context).toMatchObject({ baselineRun: B, currentRun: C, keptAvailable: true, warnings: [] });
    expect(compare!.context.currentCommit).toEqual({ revision: HASH_C, subject: "Add cart", committedAt: "2026-10-12T12:00:00+08:00", dirtyCount: 0 });
    expect(compare!.changes).toEqual(CHANGES);
  });

  test("another baseline gets no changes.json", () => {
    const { root, file } = repo();
    const compare = buildCompare(root, file(C), file(A));
    expect(compare?.context.keptAvailable).toBe(false);
    expect(compare?.changes).toBeNull();
    expect(compare?.context.baselineCommit).toEqual({ revision: HASH_A, subject: null, committedAt: null, dirtyCount: 0 });
  });

  test("run order, slugs and component IDs reach the context", () => {
    const { root, file } = repo();
    const codes = buildCompare(root, file(A), file(X))?.context.warnings.map((warning) => warning.code);
    expect(codes).toEqual(["different-focus", "unrelated"]);
    expect(buildCompare(root, file(B), file(C))?.context.warnings.map((warning) => warning.code)).toEqual(["outside-history", "reversed"]);
  });

  test("a missing or unparseable baseline gives null", () => {
    const { root, file } = repo();
    expect(buildCompare(root, file(C), file(BROKEN))).toBeNull();
    expect(buildCompare(root, file(C), join(root, ".archify", "gone", "candidate.sir"))).toBeNull();
  });

  test("a browsed file outside .archify can be compared with a candidate", () => {
    const { root, file } = repo();
    const browsed = put(root, "docs/arch.json", diagram({ title: "Browsed" }));
    const compare = buildCompare(root, browsed, file(A));
    expect(compare?.context).toMatchObject({ baselineRun: A, currentRun: "arch.json", keptAvailable: false, approximate: false, warnings: [] });
  });
});

describe("FR-CMP-06 Compare with… items", () => {
  test("No comparison first, then the other parseable candidates in run order", () => {
    const { root, file } = repo();
    const items = pickerItems(root, file(C), file(B));
    expect(items.map((item) => [item.label, item.description, item.file])).toEqual([
      [NO_COMPARISON, undefined, null],
      ["Shop B", B, file(B)],
      ["Shop A", A, file(A)],
      [X, X, file(X)],
      ["Shop D", D, file(D)],
    ]);
  });

  test("details: commit from the lineage or meta.repository, then the tags", () => {
    const { root, file } = repo();
    const details = pickerItems(root, file(C), file(B)).map((item) => item.detail);
    expect(details).toEqual([undefined, "bbbbbbb Split API · regenerate · previous", "a1b2c3d", "different focus", "regenerate · outside update history"]);
  });

  test("newer runs are tagged", () => {
    const { root, file } = repo();
    const details = pickerItems(root, file(A), null).map((item) => item.detail);
    expect(details).toEqual([undefined, "ccccccc Add cart · update · newer", "bbbbbbb Split API · regenerate · newer", "different focus", "regenerate"]);
  });

  test("the current baseline is picked; without one, No comparison is", () => {
    const { root, file } = repo();
    expect(pickerItems(root, file(C), file(A)).filter((item) => item.picked).map((item) => item.file)).toEqual([file(A)]);
    expect(pickerItems(root, file(C), null).filter((item) => item.picked).map((item) => item.label)).toEqual([NO_COMPARISON]);
  });
});
