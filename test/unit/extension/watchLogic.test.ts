// FR-WAT-01, FR-CMP-08: 300 ms debouncing and the reload / switch / notify / deleted / baseline
// decisions.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ChangeBatch, DEBOUNCE_MS, watchAction, type CandidateChange } from "../../../src/extension/watchLogic";

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

describe("FR-WAT-01 decisions", () => {
  const change = (overrides: Partial<CandidateChange>): CandidateChange => ({
    file: "/r/.archify/new/candidate.json",
    created: true,
    exists: true,
    root: "/r",
    newest: "/r/.archify/new/candidate.json",
    ...overrides,
  });
  const panel = { root: "/r", file: "/r/.archify/old/candidate.json", baseline: null };

  test("a change to the shown file reloads it", () => {
    expect(watchAction(change({ file: panel.file, created: false, newest: "/r/.archify/new/candidate.json" }), panel)).toEqual({ kind: "reload" });
  });

  test("deleting the shown file shows the deleted state", () => {
    expect(watchAction(change({ file: panel.file, exists: false }), panel)).toEqual({ kind: "deleted" });
  });

  test("a new newest candidate loads into a panel open for its folder", () => {
    expect(watchAction(change({}), panel)).toEqual({ kind: "switch", root: "/r", file: "/r/.archify/new/candidate.json" });
  });

  test("a new newest candidate is offered when no panel is open or it shows another folder", () => {
    expect(watchAction(change({}), undefined)).toEqual({ kind: "notify", root: "/r", file: "/r/.archify/new/candidate.json" });
    expect(watchAction(change({}), { root: "/other", file: "/other/x.json", baseline: null })).toMatchObject({ kind: "notify" });
  });

  test.each([
    ["not the newest", { newest: "/r/.archify/later/candidate.json" }],
    ["only changed, not created", { created: false }],
    ["already deleted again", { exists: false }],
  ])("a candidate that is %s is ignored", (_case, overrides) => {
    expect(watchAction(change(overrides), panel)).toBeUndefined();
    expect(watchAction(change(overrides), undefined)).toBeUndefined();
  });
});

describe("FR-CMP-08 watching the baseline", () => {
  const baseline = "/r/.archify/older/candidate.json";
  const panel = { root: "/r", file: "/r/.archify/old/candidate.json", baseline };
  const change = (overrides: Partial<CandidateChange>): CandidateChange => ({
    file: baseline,
    created: false,
    exists: true,
    root: "/r",
    newest: panel.file,
    ...overrides,
  });

  test("a change to the baseline re-sends the comparison", () => {
    expect(watchAction(change({}), panel)).toEqual({ kind: "baselineChanged" });
  });

  test("deleting the baseline drops it", () => {
    expect(watchAction(change({ exists: false }), panel)).toEqual({ kind: "baselineDeleted" });
  });

  test("a baseline deleted and written again within one batch counts as changed", () => {
    expect(watchAction(change({ created: true }), panel)).toEqual({ kind: "baselineChanged" });
  });

  test("the shown file wins over the baseline rules", () => {
    expect(watchAction(change({ file: panel.file }), panel)).toEqual({ kind: "reload" });
    expect(watchAction(change({ file: panel.file, exists: false }), panel)).toEqual({ kind: "deleted" });
  });

  test("without a baseline another candidate's change does nothing", () => {
    expect(watchAction(change({}), { ...panel, baseline: null })).toBeUndefined();
    expect(watchAction(change({ exists: false }), { ...panel, baseline: null })).toBeUndefined();
  });

  test("a new newest candidate still switches the panel while a baseline is set", () => {
    const file = "/r/.archify/new/candidate.json";
    expect(watchAction(change({ file, created: true, newest: file }), panel)).toEqual({ kind: "switch", root: "/r", file });
  });
});
