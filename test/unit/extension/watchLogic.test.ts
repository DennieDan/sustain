// FR-WAT-01, FR-CMP-08: 300 ms debouncing, what each open viewer does about a change
// (reload / deleted / baseline) and what happens to a new newest run (open / notify).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { candidateOf, ChangeBatch, DEBOUNCE_MS, newRunAction, noteCandidate, viewerAction, type CandidateChange, type ViewerFacts } from "../../../src/extension/watchLogic";

describe("FR-WAT-01 debouncing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("events are delivered once, 300 ms after the last one, merged per file", () => {
    const flushes: [string, boolean][][] = [];
    const batch = new ChangeBatch((changes) => flushes.push([...changes]));
    batch.add("/r/a", true);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    batch.add("/r/a", false);
    batch.add("/r/b", false);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(flushes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushes).toEqual([
      [
        ["/r/a", true],
        ["/r/b", false],
      ],
    ]);
    batch.add("/r/a", false);
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(flushes[1]).toEqual([["/r/a", false]]);
  });

  test("dispose drops pending events", () => {
    const flush = vi.fn();
    const batch = new ChangeBatch(flush);
    batch.add("/r/a", true);
    batch.dispose();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("FR-WAT-01 viewer decisions", () => {
  const change = (overrides: Partial<CandidateChange>): CandidateChange => ({
    file: "/r/.archify/new/candidate.sir",
    created: true,
    exists: true,
    root: "/r",
    newest: "/r/.archify/new/candidate.sir",
    ...overrides,
  });
  const viewer: ViewerFacts = { root: "/r", file: "/r/.archify/old/candidate.sir", baseline: null, visible: true };

  test("a change to the shown file reloads it", () => {
    expect(viewerAction(change({ file: viewer.file, created: false }), viewer)).toBe("reload");
  });

  test("deleting the shown file shows the deleted state", () => {
    expect(viewerAction(change({ file: viewer.file, exists: false }), viewer)).toBe("deleted");
  });

  test("another file's change leaves the viewer alone", () => {
    expect(viewerAction(change({}), viewer)).toBeUndefined();
  });
});

describe("FR-WAT-01 new newest run", () => {
  const NEW = "/r/.archify/new/candidate.sir";
  const change = (overrides: Partial<CandidateChange>): CandidateChange => ({ file: NEW, created: true, exists: true, root: "/r", newest: NEW, ...overrides });
  const facts = (overrides: Partial<ViewerFacts>): ViewerFacts => ({ root: "/r", file: "/r/.archify/old/candidate.sir", baseline: null, visible: true, ...overrides });

  test("opens beside a viewer of its folder", () => {
    expect(newRunAction(change({}), [facts({})])).toEqual({ kind: "open", viewer: 0 });
  });

  test("prefers a visible viewer of its folder over a hidden one and ignores other folders", () => {
    const viewers = [facts({ root: "/other", file: "/other/.archify/x/candidate.sir" }), facts({ visible: false }), facts({ file: "/r/.archify/older/candidate.sir" })];
    expect(newRunAction(change({}), viewers)).toEqual({ kind: "open", viewer: 2 });
    expect(newRunAction(change({}), viewers.slice(0, 2))).toEqual({ kind: "open", viewer: 1 });
  });

  test("is announced when no viewer is open or only viewers of other folders", () => {
    expect(newRunAction(change({}), [])).toEqual({ kind: "notify" });
    expect(newRunAction(change({}), [facts({ root: "/other", file: "/other/x.sir" })])).toEqual({ kind: "notify" });
  });

  test("does nothing when a viewer already shows it", () => {
    expect(newRunAction(change({}), [facts({ file: NEW })])).toBeUndefined();
  });

  test("a new newest run still opens while the viewer of its folder has a baseline", () => {
    expect(newRunAction(change({}), [facts({ baseline: "/r/.archify/older/candidate.sir" })])).toEqual({ kind: "open", viewer: 0 });
  });

  test.each([
    ["not the newest", { newest: "/r/.archify/later/candidate.sir" }],
    ["only changed, not created", { created: false }],
    ["already deleted again", { exists: false }],
  ])("a candidate that is %s is ignored", (_case, overrides) => {
    expect(newRunAction(change(overrides), [facts({})])).toBeUndefined();
    expect(newRunAction(change(overrides), [])).toBeUndefined();
  });
});

describe("FR-CMP-08 watching the baseline", () => {
  const baseline = "/r/.archify/older/candidate.sir";
  const viewer: ViewerFacts = { root: "/r", file: "/r/.archify/old/candidate.sir", baseline, visible: true };
  const change = (overrides: Partial<CandidateChange>): CandidateChange => ({
    file: baseline,
    created: false,
    exists: true,
    root: "/r",
    newest: viewer.file,
    ...overrides,
  });

  test("a change to the baseline re-sends the comparison", () => {
    expect(viewerAction(change({}), viewer)).toBe("baselineChanged");
  });

  test("deleting the baseline drops it", () => {
    expect(viewerAction(change({ exists: false }), viewer)).toBe("baselineDeleted");
  });

  test("a baseline deleted and written again within one batch counts as changed", () => {
    expect(viewerAction(change({ created: true }), viewer)).toBe("baselineChanged");
  });

  test("the shown file wins over the baseline rules", () => {
    const self = { ...viewer, baseline: viewer.file };
    expect(viewerAction(change({ file: viewer.file }), self)).toBe("reload");
    expect(viewerAction(change({ file: viewer.file, exists: false }), self)).toBe("deleted");
  });

  test("without a baseline another candidate's change does nothing", () => {
    expect(viewerAction(change({}), { ...viewer, baseline: null })).toBeUndefined();
    expect(viewerAction(change({ exists: false }), { ...viewer, baseline: null })).toBeUndefined();
  });
});

describe("FR-WAT-01 candidates from any event in a run folder", () => {
  test("an event anywhere in a run folder concerns that folder's candidate.sir", () => {
    const archify = "/r/.archify";
    expect(candidateOf(archify, "/r/.archify/run-a", "/")).toBe("/r/.archify/run-a/candidate.sir");
    expect(candidateOf(archify, "/r/.archify/run-a/.candidate.sir.tmp-1-2", "/")).toBe("/r/.archify/run-a/candidate.sir");
    expect(candidateOf(archify, "/r/.archify", "/")).toBeUndefined();
    expect(candidateOf(archify, "/r/.archifyx/run-a", "/")).toBeUndefined();
  });

  test("a candidate is new once, then a change, and new again after it was deleted", () => {
    const known = new Set<string>();
    expect(noteCandidate(known, "/r/.archify/a/candidate.sir", true)).toBe(true);
    expect(noteCandidate(known, "/r/.archify/a/candidate.sir", true)).toBe(false);
    expect(noteCandidate(known, "/r/.archify/a/candidate.sir", false)).toBe(false);
    expect(noteCandidate(known, "/r/.archify/a/candidate.sir", true)).toBe(true);
  });
});
