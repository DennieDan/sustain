// FR-VIEW-04/06, FR-CMP-09..12: the webview entry point builds its DOM, says ready, renders loaded
// diagrams, fits on a new file, keeps the viewport on a reload of the same file, shows empty
// states, and shows a comparison (header, marks, panel, tooltip lines) with persisted state.
// The layout is mocked with the hand-built grid scene so this tests the wiring only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { layoutDiagram } from "../../src/layout/layout";
import type { Scene } from "../../src/layout/scene";
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import type { ChangesState } from "../../webview/changes";
import { FOCUS_PADDING, fitView } from "../../webview/viewport";
import { CURRENT_DOC, compare } from "./support/compare";
import { gridScene } from "./support/scene";

vi.mock("../../src/layout/layout", () => ({ layoutDiagram: vi.fn() }));

// webview/main.ts runs on import: the VS Code API, panel size and canvas must be stubbed first.
// The stored state has the changes panel collapsed, so startup restores it (FR-CMP-12).
const { posted, fonts, states } = vi.hoisted(() => {
  const posted: WebviewMessage[] = [];
  const fonts: string[] = [];
  const states: ChangesState[] = [];
  vi.stubGlobal("acquireVsCodeApi", () => ({
    postMessage: (message: WebviewMessage) => posted.push(message),
    getState: () => ({ marks: true, collapsed: true }),
    setState: (state: ChangesState) => states.push(state),
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  const context = {
    set font(value: string) {
      fonts.push(value);
    },
    measureText: (text: string) => ({ width: text.length * 7 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  document.body.style.setProperty("--vscode-font-family", "Test Sans");
  return { posted, fonts, states };
});

import "../../webview/main";

const startup = [...posted];

const DOC_A = {
  meta: { title: "A" },
  components: [
    { id: "web", label: "Web", type: "frontend", sources: [{ path: "web/src/main.ts", line: 1 }] },
    { id: "api", label: "API", type: "backend" },
  ],
  connections: [{ from: "web", to: "api", variant: "emphasis" }],
};
const DOC_B = { components: [{ id: "solo", label: "Solo", type: "cloud" }] };

function send(message: HostMessage): void {
  window.dispatchEvent(new MessageEvent("message", { data: message }));
}

function app(): Element {
  return document.querySelector("body > .app")!;
}

function transform(): string | null {
  return document.querySelector(".canvas > .viewport")!.getAttribute("transform");
}

function fitTransform(scene: Scene): string {
  const view = fitView(scene.bounds, { width: 800, height: 600 });
  return `translate(${view.x} ${view.y}) scale(${view.scale})`;
}

beforeEach(() => {
  vi.mocked(layoutDiagram).mockReset();
  vi.mocked(layoutDiagram).mockImplementation(async (diagram) => gridScene(diagram));
  posted.length = 0;
  send({ type: "empty", message: "reset" });
});

describe("FR-VIEW-04/06 webview main", () => {
  test("builds the DOM skeleton in body and posts ready once on start", () => {
    expect(startup).toEqual([{ type: "ready" }]);
    expect(document.querySelectorAll("body > .app").length).toBe(1);
    const root = app();
    expect(root.querySelector("svg.canvas > g.viewport")).not.toBeNull();
    expect([...root.querySelectorAll(".toolbar > button")].map((b) => b.getAttribute("data-action"))).toEqual(["fit", "zoom-out", "zoom-in", "reset"]);
    expect([...root.querySelectorAll(".toolbar > button")].map((b) => b.textContent)).toEqual(["Fit", "\u2212", "+", "100\u00a0%"]);
    expect(root.querySelector(".empty-state")).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".tooltip")?.hidden).toBe(true);
  });

  test("load measures text with the VS Code font, lays out at the panel size, renders and fits", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    const [diagram, options] = vi.mocked(layoutDiagram).mock.calls[0]!;
    expect(diagram.components.map((c) => c.id)).toEqual(["web", "api"]);
    expect(options.viewport).toEqual({ width: 800, height: 600 });
    expect(options.measure("abcd", 14, true)).toEqual({ width: 28, height: 14 * 1.32 });
    expect(fonts.at(-1)).toBe("bold 14px Test Sans");
    options.measure("abcd", 11, false);
    expect(fonts.at(-1)).toBe("11px Test Sans");
    expect(document.querySelectorAll(".edge--emphasis").length).toBe(1);
    expect(app().classList.contains("app--empty")).toBe(false);
    expect(document.querySelector<HTMLElement>(".empty-state")?.hidden).toBe(true);
    expect(transform()).toBe(fitTransform(gridScene(diagram)));
  });

  test("a reload of the same file keeps the viewport; another file fits", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    const zoomed = transform();
    expect(zoomed).not.toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[0]![0])));

    send({ type: "load", doc: { ...DOC_A, components: [...DOC_A.components, { id: "db", label: "DB", type: "database" }] }, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    expect(transform()).toBe(zoomed);

    send({ type: "load", doc: DOC_B, file: "/r/b.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(1));
    expect(transform()).toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[2]![0])));
  });

  test("empty shows the message, clears the diagram, and the next load fits again", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));

    send({ type: "empty", message: "No architecture diagram yet." });
    expect(document.querySelectorAll(".node").length).toBe(0);
    expect(app().classList.contains("app--empty")).toBe(true);
    const empty = document.querySelector<HTMLElement>(".empty-state")!;
    expect([empty.hidden, empty.textContent]).toEqual([false, "No architecture diagram yet."]);

    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(transform()).toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[1]![0])));
  });

  test("an unreadable document or a failed layout shows an empty state with the reason", async () => {
    send({ type: "load", doc: { components: [] }, file: "/r/bad.json", compare: null });
    expect(document.querySelector(".empty-state")?.textContent).toBe("Can't show `/r/bad.json`: it has no components");
    expect(layoutDiagram).not.toHaveBeenCalled();

    vi.mocked(layoutDiagram).mockRejectedValueOnce(new Error("ELK failed"));
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelector(".empty-state")?.textContent).toBe("Can't show `/r/a.json`: ELK failed"));
    expect(app().classList.contains("app--empty")).toBe(true);
  });

  test("a slower, older layout never replaces a newer diagram", async () => {
    const slow = Promise.withResolvers<Scene>();
    vi.mocked(layoutDiagram).mockImplementationOnce(() => slow.promise);
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    send({ type: "load", doc: DOC_B, file: "/r/b.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(1));
    slow.resolve(gridScene(vi.mocked(layoutDiagram).mock.calls[0]![0]));
    // load() awaited the same promise earlier, so its continuation has run once this await returns.
    await slow.promise;
    expect([...document.querySelectorAll(".node")].map((n) => n.getAttribute("data-id"))).toEqual(["solo"]);
  });

  test("clicking a tooltip source posts openSource through the VS Code API", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    vi.useFakeTimers();
    try {
      document.querySelector('.node[data-id="web"] .node__box')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(300);
      document.querySelector<HTMLElement>(".tooltip .tooltip__source")!.click();
      expect(posted).toEqual([{ type: "openSource", componentId: "web", index: 0 }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("FR-CMP-09..12 webview main change view", () => {
  async function loadCompared(message: Partial<Extract<HostMessage, { type: "load" }>> = {}): Promise<void> {
    send({ type: "load", doc: CURRENT_DOC, file: "/r/current.json", compare: compare(), ...message });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
  }

  function toggle(): HTMLButtonElement {
    return document.querySelector<HTMLButtonElement>(".header .header__toggle")!;
  }

  function marks(): string[] {
    const statusClass = /^(node|edge|boundary)--(added|changed|renamed|kept)$/;
    return [...document.querySelectorAll(".node, .edge, .boundary")].flatMap((el) => [...el.classList].filter((c) => statusClass.test(c)));
  }

  test("the header sits above the stage that holds the canvas, toolbar and panel", async () => {
    await loadCompared();
    expect([...app().children].map((c) => c.className)).toEqual(["header", "stage", "tooltip"]);
    const stage = app().querySelector(".stage")!;
    expect(stage.querySelector("svg.canvas")).not.toBeNull();
    expect(stage.querySelector(".toolbar")).not.toBeNull();
    expect(stage.querySelector("aside.changes")).not.toBeNull();
  });

  test("without a comparison the header says No comparison, and Compare with… posts compareWith", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(document.querySelector(".header")!.textContent).toBe("No comparison" + "Compare with\u2026");
    expect(document.querySelector<HTMLElement>(".changes")!.hidden).toBe(true);
    expect(marks()).toEqual([]);
    document.querySelector<HTMLButtonElement>(".header__compare")!.click();
    expect(posted).toEqual([{ type: "compareWith" }]);
  });

  test("an unreadable baseline is no comparison", async () => {
    await loadCompared({ compare: { ...compare(), baselineDoc: { components: [] } } });
    expect(document.querySelector(".header__none")!.textContent).toBe("No comparison");
    expect(marks()).toEqual([]);
  });

  test("the stored state restores the collapsed panel on start", async () => {
    await loadCompared();
    const panel = document.querySelector<HTMLElement>(".changes")!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector<HTMLElement>(".changes__body")!.hidden).toBe(true);
  });

  test("marks per status; toggling off removes them without layout or viewport change, and persists", async () => {
    await loadCompared();
    expect(marks()).toEqual(["boundary--renamed", "boundary--added", "edge--changed", "edge--added", "node--changed", "node--kept", "node--added"]);
    expect([...document.querySelectorAll(".node .status-badge")].map((b) => [b.closest(".node")!.getAttribute("data-id"), b.textContent])).toEqual([
      ["web", "CHANGED"],
      ["api", "KEPT"],
      ["db", "NEW"],
    ]);
    expect([...document.querySelectorAll(".boundary .status-badge")].map((b) => b.textContent)).toEqual(["RENAMED", "NEW"]);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    const before = transform();
    const layouts = vi.mocked(layoutDiagram).mock.calls.length;
    states.length = 0;

    toggle().click();
    expect(marks()).toEqual([]);
    expect(document.querySelectorAll(".status-badge").length).toBe(0);
    expect(document.querySelector<HTMLElement>(".changes")!.hidden).toBe(true);
    expect(transform()).toBe(before);
    expect(vi.mocked(layoutDiagram).mock.calls.length).toBe(layouts);
    expect(states).toEqual([{ marks: false, collapsed: true }]);

    toggle().click();
    expect(marks().length).toBe(7);
    expect(transform()).toBe(before);
    expect(states.at(-1)).toEqual({ marks: true, collapsed: true });
  });

  test("clicking a panel row fits the element with 40 px padding into the area the expanded panel leaves free", async () => {
    await loadCompared();
    const panel = document.querySelector<HTMLElement>(".changes")!;
    // Own property: the prototype method is already the suite-wide 800×600 spy.
    Object.defineProperty(panel, "getBoundingClientRect", { configurable: true, value: () => new DOMRect(600, 0, 200, 600) });
    document.querySelector<HTMLButtonElement>(".changes__collapse")!.click();
    expect(panel.classList.contains("changes--collapsed")).toBe(false);
    document.querySelector<HTMLButtonElement>('.changes__section[data-section="added"] .changes__item[data-kind="component"]')!.click();
    const view = fitView({ x: 440, y: 0, w: 160, h: 80 }, { width: 600, height: 600 }, FOCUS_PADDING);
    expect(transform()).toBe(`translate(${view.x} ${view.y}) scale(${view.scale})`);
    document.querySelector<HTMLButtonElement>(".changes__collapse")!.click();
    delete (panel as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  });

  test("the tooltip shows the status and changed files; a file click posts openFile", async () => {
    await loadCompared();
    vi.useFakeTimers();
    try {
      document.querySelector('.node[data-id="api"] .node__box')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
      vi.advanceTimersByTime(300);
      expect(document.querySelector(".tooltip .tooltip__status")!.textContent).toBe("Kept");
      expect([...document.querySelectorAll(".tooltip .tooltip__file")].map((f) => f.textContent)).toEqual(["M api/main.go", "D api/gone.go", "R api/old.go \u2192 api/new.go"]);
      document.querySelector<HTMLElement>(".tooltip button.tooltip__file")!.click();
      expect(posted).toEqual([{ type: "openFile", path: "api/main.go" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
