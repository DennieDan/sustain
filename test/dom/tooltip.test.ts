// FR-VIEW-07, FR-CMP-12: hover delay, contents, stay/hide rules, source and changed-file clicks of the node tooltip.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { WebviewMessage } from "../../src/model/messages";
import type { ViewDiagram } from "../../src/core/tolerant";
import type { FileChange } from "../../src/core/runChanges";
import { renderScene } from "../../webview/render";
import { HIDE_DELAY_MS, SHOW_DELAY_MS, TooltipController, formatSource } from "../../webview/tooltip";
import { fixedMeasure, gridScene } from "./support/scene";

const SVG_NS = "http://www.w3.org/2000/svg";

const DIAGRAM: ViewDiagram = {
  components: [
    {
      id: "api",
      label: "Orders API",
      sublabel: "Go service",
      type: "backend",
      sources: [
        { path: "cmd/api/main.go", line: 12, end_line: 40, label: "entry point" },
        { path: "internal/orders/handler.go", line: 7 },
        { path: "internal/orders", label: "package" },
        { path: "go.mod" },
      ],
    },
    { id: "db", label: "Orders DB", type: "database", sources: [] },
  ],
  connections: [],
  boundaries: [],
};

describe("FR-VIEW-07 formatSource", () => {
  test.each([
    [{ path: "a/b.ts", line: 3, end_line: 9 }, "a/b.ts:3\u20139"],
    [{ path: "a/b.ts", line: 3 }, "a/b.ts:3"],
    [{ path: "a/b.ts", line: 3, end_line: 3 }, "a/b.ts:3"],
    [{ path: "a/b.ts" }, "a/b.ts"],
    [{ path: "a/b.ts", end_line: 9 }, "a/b.ts"],
  ])("%o → %s", (source, expected) => {
    expect(formatSource(source)).toBe(expected);
  });
});

describe("FR-VIEW-07 tooltip", () => {
  let svg: SVGSVGElement;
  let element: HTMLDivElement;
  let posted: WebviewMessage[];
  let tooltip: TooltipController;

  beforeEach(() => {
    vi.useFakeTimers();
    svg = document.createElementNS(SVG_NS, "svg");
    const content = document.createElementNS(SVG_NS, "g");
    svg.append(content);
    renderScene(content, DIAGRAM, gridScene(DIAGRAM), fixedMeasure);
    element = document.createElement("div");
    element.hidden = true;
    document.body.replaceChildren(svg, element);
    posted = [];
    tooltip = new TooltipController(svg, element, (message) => posted.push(message));
    tooltip.setDiagram(DIAGRAM);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  function part(id: string, selector: string): Element {
    return svg.querySelector(`.node[data-id="${id}"] ${selector}`)!;
  }

  /** Pointer moves from `from` to `to` (either may be null for "outside everything"). */
  function move(from: Element | null, to: Element | null): void {
    if (from) {
      from.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: to }));
      if (from === element) element.dispatchEvent(new PointerEvent("pointerleave", { relatedTarget: to }));
    }
    if (to) {
      to.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, relatedTarget: from }));
      if (to === element) element.dispatchEvent(new PointerEvent("pointerenter", { relatedTarget: from }));
    }
  }

  test("shows after hovering a node for 300 ms, not before", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS - 1);
    expect(element.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(element.hidden).toBe(false);
    expect(element.querySelector(".tooltip__label")?.textContent).toBe("Orders API");
  });

  test("moving between parts of the same node does not restart the delay", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(200);
    move(part("api", ".node__box"), part("api", ".node__label"));
    vi.advanceTimersByTime(100);
    expect(element.hidden).toBe(false);
  });

  test("leaving the node before 300 ms shows nothing", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(250);
    move(part("api", ".node__box"), svg);
    vi.advanceTimersByTime(1000);
    expect(element.hidden).toBe(true);
  });

  test("lists label, sublabel, type and every source with its label", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(element.querySelector(".tooltip__sublabel")?.textContent).toBe("Go service");
    expect(element.querySelector(".tooltip__type")?.textContent).toBe("backend");
    const sources = [...element.querySelectorAll(".tooltip__source")].map((s) => [
      s.querySelector(".tooltip__path")?.textContent,
      s.querySelector(".tooltip__source-label")?.textContent,
    ]);
    expect(sources).toEqual([
      ["cmd/api/main.go:12\u201340", "entry point"],
      ["internal/orders/handler.go:7", undefined],
      ["internal/orders", "package"],
      ["go.mod", undefined],
    ]);
  });

  test("a node without sublabel or sources shows neither", () => {
    move(null, part("db", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(element.querySelector(".tooltip__label")?.textContent).toBe("Orders DB");
    expect(element.querySelector(".tooltip__type")?.textContent).toBe("database");
    expect(element.querySelector(".tooltip__sublabel")).toBeNull();
    expect(element.querySelector(".tooltip__sources")).toBeNull();
  });

  test("ACC-03 a doubtful box's tooltip says why, under its type", () => {
    tooltip.setNotes("checks", { api: "The audit found it partial: no request handling is cited." });
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect([...element.children].map((child) => child.className).slice(0, 4)).toEqual(["tooltip__label", "tooltip__sublabel", "tooltip__type", "tooltip__note"]);
    expect(element.querySelector(".tooltip__note")?.textContent).toBe("The audit found it partial: no request handling is cited.");
    move(part("api", ".node__box"), null);
    vi.advanceTimersByTime(1000);
    move(null, part("db", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    expect(element.querySelector(".tooltip__note")).toBeNull();
  });

  test("hides 200 ms after leaving the node", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    move(part("api", ".node__box"), svg);
    vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
    expect(element.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(element.hidden).toBe(true);
    expect(element.children.length).toBe(0);
  });

  test("stays while moving node → tooltip, hides 200 ms after leaving the tooltip", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    move(part("api", ".node__box"), svg);
    vi.advanceTimersByTime(HIDE_DELAY_MS - 50);
    move(svg, element);
    vi.advanceTimersByTime(5000);
    expect(element.hidden).toBe(false);
    move(element, null);
    vi.advanceTimersByTime(HIDE_DELAY_MS - 1);
    expect(element.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(element.hidden).toBe(true);
  });

  test("stays while moving tooltip → its node", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    move(part("api", ".node__box"), element);
    move(element, part("api", ".node__label"));
    vi.advanceTimersByTime(5000);
    expect(element.hidden).toBe(false);
    expect(element.querySelector(".tooltip__label")?.textContent).toBe("Orders API");
  });

  test("moving to another node hides the old tooltip after 200 ms and shows the new one at 300 ms", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    move(part("api", ".node__box"), part("db", ".node__box"));
    vi.advanceTimersByTime(HIDE_DELAY_MS);
    expect(element.hidden).toBe(true);
    vi.advanceTimersByTime(SHOW_DELAY_MS - HIDE_DELAY_MS);
    expect(element.hidden).toBe(false);
    expect(element.querySelector(".tooltip__label")?.textContent).toBe("Orders DB");
  });

  test("clicking a source entry posts openSource with that source's index", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(SHOW_DELAY_MS);
    element.querySelectorAll<HTMLElement>(".tooltip__source .tooltip__path")[2]!.click();
    element.querySelectorAll<HTMLElement>(".tooltip__source")[0]!.click();
    expect(posted).toEqual([
      { type: "openSource", componentId: "api", index: 2 },
      { type: "openSource", componentId: "api", index: 0 },
    ]);
  });

  test("hide() and a new diagram cancel a pending show", () => {
    move(null, part("api", ".node__box"));
    vi.advanceTimersByTime(100);
    tooltip.hide();
    vi.advanceTimersByTime(1000);
    expect(element.hidden).toBe(true);
    move(svg, part("db", ".node__box"));
    vi.advanceTimersByTime(100);
    tooltip.setDiagram(undefined);
    vi.advanceTimersByTime(1000);
    expect(element.hidden).toBe(true);
    expect(posted).toEqual([]);
  });

  describe("FR-CMP-12 change lines", () => {
    const FILES: FileChange[] = [
      { status: "M", path: "cmd/api/main.go" },
      { status: "D", path: "internal/gone.go" },
      { status: "R", path: "internal/new.go", oldPath: "internal/old.go" },
    ];

    function show(id: string): void {
      move(null, part(id, ".node__box"));
      vi.advanceTimersByTime(SHOW_DELAY_MS);
    }

    test("a changed node lists its changed fields after the type; files follow the sources", () => {
      tooltip.setChanges({
        statuses: [
          { status: "changed", fields: [{ field: "label", before: "API", after: "Orders API" }, { field: "sources" }] },
          { status: "added", fields: [] },
        ],
        files: new Map([["api", FILES]]),
      });
      show("api");
      expect([...element.children].map((c) => c.className)).toEqual([
        "tooltip__label",
        "tooltip__sublabel",
        "tooltip__type",
        "tooltip__status tooltip__status--changed",
        "tooltip__sources",
        "tooltip__files",
      ]);
      expect(element.querySelector(".tooltip__status")!.textContent).toBe("Changed: label, sources");
      expect([...element.querySelectorAll(".tooltip__file")].map((f) => [f.tagName, f.textContent])).toEqual([
        ["BUTTON", "M cmd/api/main.go"],
        ["SPAN", "D internal/gone.go"],
        ["BUTTON", "R internal/old.go \u2192 internal/new.go"],
      ]);
      for (const file of element.querySelectorAll<HTMLElement>(".tooltip__file")) file.click();
      expect(posted).toEqual([
        { type: "openFile", path: "cmd/api/main.go" },
        { type: "openFile", path: "internal/new.go" },
      ]);
    });

    test("kept and new status lines; no files without changes data", () => {
      tooltip.setChanges({ statuses: [{ status: "kept", fields: [] }, { status: "added", fields: [] }], files: undefined });
      show("api");
      expect(element.querySelector(".tooltip__status")!.textContent).toBe("Kept");
      expect(element.querySelector(".tooltip__files")).toBeNull();
      tooltip.hide();
      show("db");
      expect(element.querySelector(".tooltip__status")!.textContent).toBe("New");
    });

    test("unchanged nodes and marks off show no change lines", () => {
      tooltip.setChanges({ statuses: [{ status: "unchanged", fields: [] }], files: new Map([["api", FILES]]) });
      show("api");
      expect(element.querySelector(".tooltip__status")).toBeNull();
      tooltip.setChanges(undefined);
      move(part("api", ".node__box"), null);
      show("api");
      expect(element.hidden).toBe(false);
      expect(element.querySelector(".tooltip__status")).toBeNull();
      expect(element.querySelector(".tooltip__files")).toBeNull();
    });
  });
});
