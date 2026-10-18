// FR-VIEW-04/06: the webview entry point builds its DOM, says ready, renders loaded diagrams,
// fits on a new file, keeps the viewport on a reload of the same file and shows empty states.
// The layout is mocked with the hand-built grid scene so this tests the wiring only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { layoutDiagram } from "../../src/layout/layout";
import type { Scene } from "../../src/layout/scene";
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import { fitView } from "../../webview/viewport";
import { gridScene } from "./support/scene";

vi.mock("../../src/layout/layout", () => ({ layoutDiagram: vi.fn() }));

// webview/main.ts runs on import: the VS Code API, panel size and canvas must be stubbed first.
const { posted, fonts } = vi.hoisted(() => {
  const posted: WebviewMessage[] = [];
  const fonts: string[] = [];
  vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: (message: WebviewMessage) => posted.push(message) }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 800, 600));
  const context = {
    set font(value: string) {
      fonts.push(value);
    },
    measureText: (text: string) => ({ width: text.length * 7 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  document.body.style.setProperty("--vscode-font-family", "Test Sans");
  return { posted, fonts };
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
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
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
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));
    const zoomed = transform();
    expect(zoomed).not.toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[0]![0])));

    send({ type: "load", doc: { ...DOC_A, components: [...DOC_A.components, { id: "db", label: "DB", type: "database" }] }, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    expect(transform()).toBe(zoomed);

    send({ type: "load", doc: DOC_B, file: "/r/b.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(1));
    expect(transform()).toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[2]![0])));
  });

  test("empty shows the message, clears the diagram, and the next load fits again", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+" }));

    send({ type: "empty", message: "No architecture diagram yet." });
    expect(document.querySelectorAll(".node").length).toBe(0);
    expect(app().classList.contains("app--empty")).toBe(true);
    const empty = document.querySelector<HTMLElement>(".empty-state")!;
    expect([empty.hidden, empty.textContent]).toEqual([false, "No architecture diagram yet."]);

    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(transform()).toBe(fitTransform(gridScene(vi.mocked(layoutDiagram).mock.calls[1]![0])));
  });

  test("an unreadable document or a failed layout shows an empty state with the reason", async () => {
    send({ type: "load", doc: { components: [] }, file: "/r/bad.json" });
    expect(document.querySelector(".empty-state")?.textContent).toBe("Can't show `/r/bad.json`: it has no components");
    expect(layoutDiagram).not.toHaveBeenCalled();

    vi.mocked(layoutDiagram).mockRejectedValueOnce(new Error("ELK failed"));
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelector(".empty-state")?.textContent).toBe("Can't show `/r/a.json`: ELK failed"));
    expect(app().classList.contains("app--empty")).toBe(true);
  });

  test("a slower, older layout never replaces a newer diagram", async () => {
    const slow = Promise.withResolvers<Scene>();
    vi.mocked(layoutDiagram).mockImplementationOnce(() => slow.promise);
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    send({ type: "load", doc: DOC_B, file: "/r/b.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(1));
    slow.resolve(gridScene(vi.mocked(layoutDiagram).mock.calls[0]![0]));
    // load() awaited the same promise earlier, so its continuation has run once this await returns.
    await slow.promise;
    expect([...document.querySelectorAll(".node")].map((n) => n.getAttribute("data-id"))).toEqual(["solo"]);
  });

  test("clicking a tooltip source posts openSource through the VS Code API", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
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

describe("UI-03 boxes citing the active file", () => {
  beforeEach(() => send({ type: "highlight", ids: [], file: null, follow: false }));

  test("the citing boxes are marked, the rest dimmed, and the bar names the file", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(document.querySelector<HTMLElement>(".highlight")!.hidden).toBe(true);
    send({ type: "highlight", ids: ["web"], file: "web/src/main.ts", follow: false });
    expect([...document.querySelectorAll(".node--highlight")].map((node) => node.getAttribute("data-id"))).toEqual(["web"]);
    expect(app().classList.contains("app--highlighting")).toBe(true);
    expect(document.querySelector(".highlight__text")!.textContent).toBe("1 box cites main.ts");

    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(vi.mocked(layoutDiagram).mock.calls.length).toBe(2));
    await vi.waitFor(() => expect(document.querySelectorAll(".node--highlight").length).toBe(1));

    send({ type: "highlight", ids: [], file: "README.md", follow: false });
    expect(document.querySelector(".highlight__text")!.textContent).toBe("No box cites README.md");
    expect(app().classList.contains("app--highlighting")).toBe(false);
  });

  test("Follow editor posts the toggle and shows its state", () => {
    send({ type: "highlight", ids: [], file: "a.ts", follow: false });
    const follow = document.querySelector<HTMLButtonElement>(".highlight__follow")!;
    follow.click();
    expect(posted).toEqual([{ type: "setFollow", on: true }]);
    send({ type: "highlight", ids: [], file: "a.ts", follow: true });
    expect(follow.getAttribute("aria-pressed")).toBe("true");
    follow.click();
    expect(posted.at(-1)).toEqual({ type: "setFollow", on: false });
  });

  test("a folder without a map offers to map it", () => {
    send({ type: "empty", message: "No map of this folder yet.", action: "mapFolder" });
    const empty = document.querySelector<HTMLElement>(".empty-state")!;
    expect(empty.firstChild?.textContent).toBe("No map of this folder yet.");
    empty.querySelector<HTMLButtonElement>(".empty-state__action")!.click();
    expect(posted).toEqual([{ type: "mapFolder" }]);
  });
});
