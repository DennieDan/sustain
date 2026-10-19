// FR-CMP-09/11/12, §5.4: the header strip, the changes panel and their state, drawn from a
// baseline/open pair; repository text goes in as text only.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { WebviewMessage } from "../../src/model/messages";
import { readDiagram } from "../../src/model/tolerant";
import type { ViewDiagram } from "../../src/model/tolerant";
import { ChangesView, KEPT_NOTE, NO_DIFF_TEXT, compareDiagrams, readChangesState, relativeDate } from "../../webview/changes";
import type { ChangesState } from "../../webview/changes";
import type { ElementKind } from "../../webview/render";
import { BASE_REVISION, CURRENT_DOC, NOW, compare } from "./support/compare";

function diagramOf(doc: unknown): ViewDiagram {
  const result = readDiagram(doc);
  if (!result.ok) throw new Error(result.reason);
  return result.diagram;
}

const CURRENT = diagramOf(CURRENT_DOC);

describe("FR-CMP-09 relativeDate", () => {
  test.each([
    ["2026-10-19T11:59:30Z", "just now"],
    ["2026-10-19T12:05:00Z", "just now"],
    ["2026-10-19T11:59:00Z", "1 minute ago"],
    ["2026-10-19T11:15:00Z", "45 minutes ago"],
    ["2026-10-19T11:00:00Z", "1 hour ago"],
    ["2026-10-19T01:00:00Z", "11 hours ago"],
    ["2026-10-18T12:00:00Z", "1 day ago"],
    ["2026-09-19T12:00:00Z", "30 days ago"],
    ["2026-09-19T11:59:00+08:00", "2026-09-19"],
    ["2025-01-02T03:04:05Z", "2025-01-02"],
  ])("%s → %s", (iso, expected) => {
    expect(relativeDate(iso, NOW)).toBe(expected);
  });

  test("an unparseable date gives undefined", () => {
    expect(relativeDate("yesterday", NOW)).toBeUndefined();
  });
});

describe("FR-CMP-12 readChangesState", () => {
  test("defaults to marks on and the panel expanded; keeps valid booleans", () => {
    expect(readChangesState(undefined)).toEqual({ marks: true, collapsed: false });
    expect(readChangesState({ marks: "no", collapsed: 1 })).toEqual({ marks: true, collapsed: false });
    expect(readChangesState({ marks: false, collapsed: true })).toEqual({ marks: false, collapsed: true });
  });
});

describe("FR-CMP-05 compareDiagrams", () => {
  test("no compare or an unreadable baseline gives no comparison", () => {
    expect(compareDiagrams(CURRENT, null)).toBeNull();
    expect(compareDiagrams(CURRENT, { ...compare(), baselineDoc: { components: [] } })).toBeNull();
  });

  test("kept components are marked only when changes are present", () => {
    expect(compareDiagrams(CURRENT, compare())!.diff.components.map((d) => d.status)).toEqual(["changed", "kept", "added"]);
    expect(compareDiagrams(CURRENT, compare({}, null))!.diff.components.map((d) => d.status)).toEqual(["changed", "unchanged", "added"]);
  });
});

describe("FR-CMP-09/11 ChangesView", () => {
  let header: HTMLDivElement;
  let panel: HTMLElement;
  let posted: WebviewMessage[];
  let focused: [ElementKind, number][];
  let saved: ChangesState[];

  function view(state: ChangesState = { marks: true, collapsed: false }): ChangesView {
    return new ChangesView(
      header,
      panel,
      { post: (m) => posted.push(m), focus: (kind, index) => focused.push([kind, index]), stateChanged: (s) => saved.push(s) },
      state,
      () => NOW,
    );
  }

  function strip(): string {
    return header.querySelector(".header__strip")!.textContent!;
  }

  function sections(): [string | null, string][] {
    return [...panel.querySelectorAll(".changes__section")].map((s) => [s.getAttribute("data-section"), s.querySelector(".changes__heading")!.textContent!]);
  }

  function rows(section: string): string[] {
    return [...panel.querySelectorAll(`.changes__section[data-section="${section}"] .changes__item`)].map((r) => r.textContent!);
  }

  beforeEach(() => {
    header = document.createElement("div");
    panel = document.createElement("aside");
    document.body.replaceChildren(header, panel);
    posted = [];
    focused = [];
    saved = [];
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  test("full comparison: commits, dirty count, run folder, counts, buttons; the date's title is the ISO timestamp", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, compare({ approximate: true })));
    expect(strip()).toBe(
      "Compared with 1234567 \u201cAdd orders\u201d \u00b7 3 days ago \u2192 fedcba0 \u201cSplit API\u201d" +
        "+ 3 uncommitted files2026-10-01-1200-orders+3 \u22123 ~3approximateCompare with\u2026Changes",
    );
    expect(header.querySelector(".header__date")!.getAttribute("title")).toBe("2026-10-16T09:00:00Z");
    expect(header.querySelector(".header__toggle")!.getAttribute("aria-pressed")).toBe("true");
    expect(header.querySelectorAll(".header__warning").length).toBe(0);
    header.querySelector<HTMLButtonElement>(".header__compare")!.click();
    expect(posted).toEqual([{ type: "compareWith" }]);
    expect(panel.hidden).toBe(false);
  });

  test("missing commits show unknown revision; missing subject and date are omitted; no dirty files, no approximate", () => {
    view().show(
      CURRENT,
      compareDiagrams(CURRENT, compare({ baselineCommit: { revision: BASE_REVISION, subject: null, committedAt: null, dirtyCount: 0 }, currentCommit: null })),
    );
    expect(strip()).toBe("Compared with 1234567 \u2192 unknown revision2026-10-01-1200-orders+3 \u22123 ~3Compare with\u2026Changes");
    view().show(CURRENT, compareDiagrams(CURRENT, compare({ baselineCommit: null })));
    expect(header.querySelector(".header__commits")!.textContent).toBe("Compared with unknown revision \u2192 fedcba0 \u201cSplit API\u201d");
  });

  test("warnings are one line each, in order; reversed ends with a Swap button that posts swap", () => {
    view().show(
      CURRENT,
      compareDiagrams(
        CURRENT,
        compare({
          warnings: [
            { code: "different-focus", message: "Different focus: `a` vs `b`." },
            { code: "reversed", message: "Baseline is newer than this diagram; changes are shown in reverse." },
          ],
        }),
      ),
    );
    const lines = [...header.querySelectorAll(".header__warning")];
    expect(lines.map((l) => [l.getAttribute("data-code"), l.textContent])).toEqual([
      ["different-focus", "Different focus: `a` vs `b`."],
      ["reversed", "Baseline is newer than this diagram; changes are shown in reverse. Swap"],
    ]);
    expect(lines[0]!.querySelector("button")).toBeNull();
    lines[1]!.querySelector<HTMLButtonElement>(".header__swap")!.click();
    expect(posted).toEqual([{ type: "swap" }]);
  });

  test("no comparison: No comparison and Compare with… only; no panel", () => {
    view().show(CURRENT, null);
    expect(strip()).toBe("No comparison" + "Compare with\u2026");
    expect([...header.querySelectorAll("button")].map((b) => b.className)).toEqual(["header__button header__compare"]);
    expect(header.querySelector(".header__toggle")).toBeNull();
    expect(panel.hidden).toBe(true);
    header.querySelector<HTMLButtonElement>(".header__compare")!.click();
    expect(posted).toEqual([{ type: "compareWith" }]);
  });

  test("§5.4: a commit subject with markup renders as text and adds no element", () => {
    const subject = "<img src=x onerror=alert(1)>";
    view().show(CURRENT, compareDiagrams(CURRENT, compare({ baselineCommit: { revision: BASE_REVISION, subject, committedAt: null, dirtyCount: 0 } })));
    expect(header.querySelector(".header__subject")!.textContent).toBe(`\u201c${subject}\u201d`);
    expect(header.querySelector(".header__subject")!.children.length).toBe(0);
    expect(document.querySelector("img")).toBeNull();
  });

  test("panel: legend, sections in order with counts, row texts", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, compare()));
    expect(panel.querySelector(".changes__title")!.textContent).toBe("Changes");
    expect([...panel.querySelectorAll(".changes__legend-item")].map((i) => i.textContent)).toEqual(["Added", "Changed", "Kept", "Removed"]);
    expect(sections()).toEqual([
      ["added", "Added 3"],
      ["removed", "Removed 3"],
      ["changed", "Changed 3"],
      ["kept", "Code changed, kept 1"],
      ["uncited", "Not in any component 3"],
    ]);
    expect(rows("added")).toEqual(["component DB", "connection API \u2192 DB", "boundary Data"]);
    expect(rows("removed")).toEqual(["component Old", "connection API \u2192 Old", "boundary Legacy"]);
    expect(rows("changed")).toEqual([
      "component Web app label: \u201cWeb\u201d \u2192 \u201cWeb app\u201d",
      "connection Web app \u2192 API (REST) label: \u201ccalls\u201d \u2192 \u201cREST\u201d",
      "boundary Application label: \u201cApp\u201d \u2192 \u201cApplication\u201d",
    ]);
    expect(rows("kept")).toEqual(["component API 3 changed files"]);
    expect(rows("uncited")).toEqual(["A docs/notes.md", "D tmp/x.txt", "R a/old.txt \u2192 b/new.txt"]);
    expect(panel.querySelector(".changes__note")).toBeNull();
    expect(panel.querySelector(".changes__empty")).toBeNull();
  });

  test("added, changed and kept rows focus their element; removed rows are not clickable; Open baseline posts", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, compare()));
    for (const button of panel.querySelectorAll<HTMLButtonElement>("button.changes__item[data-index]")) button.click();
    expect(focused).toEqual([
      ["component", 2],
      ["connection", 1],
      ["boundary", 1],
      ["component", 0],
      ["connection", 0],
      ["boundary", 0],
      ["component", 1],
    ]);
    expect(panel.querySelectorAll('.changes__section[data-section="removed"] button.changes__item').length).toBe(0);
    const removed = panel.querySelector('.changes__section[data-section="removed"]')!;
    expect(removed.lastElementChild!.textContent).toBe("Open baseline");
    removed.querySelector<HTMLButtonElement>(".changes__open-baseline")!.click();
    expect(posted).toEqual([{ type: "openBaseline" }]);
  });

  test("uncited A and R entries post openFile with the new path; D entries are plain text", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, compare()));
    const entries = [...panel.querySelectorAll('.changes__section[data-section="uncited"] .changes__item')];
    expect(entries.map((e) => e.tagName)).toEqual(["BUTTON", "SPAN", "BUTTON"]);
    for (const entry of entries) (entry as HTMLElement).click();
    expect(posted).toEqual([
      { type: "openFile", path: "docs/notes.md" },
      { type: "openFile", path: "b/new.txt" },
    ]);
  });

  test("without kept data the note replaces the kept and uncited sections when keptNote says so", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, compare({ keptAvailable: false, keptNote: true }, null)));
    expect(sections().map(([key]) => key)).toEqual(["added", "removed", "changed"]);
    expect(panel.querySelector(".changes__note")!.textContent).toBe(KEPT_NOTE);
    view().show(CURRENT, compareDiagrams(CURRENT, compare({ keptAvailable: false, keptNote: false, approximate: true }, null)));
    expect(panel.querySelector(".changes__note")).toBeNull();
  });

  test("equal diagrams: the empty-diff text above the kept and uncited sections", () => {
    view().show(CURRENT, compareDiagrams(CURRENT, { ...compare(), baselineDoc: CURRENT_DOC }));
    const body = panel.querySelector(".changes__body")!;
    expect(body.firstElementChild!.textContent).toBe(NO_DIFF_TEXT);
    expect(sections().map(([key]) => key)).toEqual(["kept", "uncited"]);
    expect(strip()).toContain("+0 \u22120 ~0");
  });

  test("the toggle and the collapse control update and report the state; a restored state applies", () => {
    const changes = view({ marks: true, collapsed: true });
    changes.show(CURRENT, compareDiagrams(CURRENT, compare()));
    expect(panel.querySelector<HTMLElement>(".changes__body")!.hidden).toBe(true);
    expect(panel.classList.contains("changes--collapsed")).toBe(true);
    panel.querySelector<HTMLButtonElement>(".changes__collapse")!.click();
    expect(panel.querySelector<HTMLElement>(".changes__body")!.hidden).toBe(false);
    header.querySelector<HTMLButtonElement>(".header__toggle")!.click();
    expect(panel.hidden).toBe(true);
    expect(header.querySelector(".header__toggle")!.getAttribute("aria-pressed")).toBe("false");
    expect(saved).toEqual([
      { marks: true, collapsed: false },
      { marks: false, collapsed: false },
    ]);
    expect(changes.state).toEqual({ marks: false, collapsed: false });

    view({ marks: false, collapsed: false }).show(CURRENT, compareDiagrams(CURRENT, compare()));
    expect(panel.hidden).toBe(true);
  });
});
