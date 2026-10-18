// FR-VIEW-04/06: the webview entry point builds its DOM, says ready, renders loaded diagrams,
// fits on a new file, keeps the viewport on a reload of the same file and shows empty states.
// The layout is mocked with the hand-built grid scene so this tests the wiring only.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { layoutDiagram } from "../../src/layout/layout";
import type { Scene } from "../../src/layout/scene";
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import { fitView } from "../../webview/viewport";
import { uncertainty } from "../../src/model/uncertainty";
import { diffMaps } from "../../src/model/diff";
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

describe("FRS-03 freshness on the map", () => {
  beforeEach(() => send({ type: "freshness", boxes: {}, header: null }));

  test("edited boxes say changed, missing boxes say missing, and the header shows the count", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(document.querySelector<HTMLElement>(".freshness")!.hidden).toBe(true);
    send({ type: "freshness", boxes: { web: "edited", api: "missing" }, header: "2 of 2 boxes changed since this map (abc1234, 2 days ago)" });
    expect([...document.querySelectorAll(".node")].map((node) => [node.getAttribute("data-id"), node.classList.contains(`node--${node.getAttribute("data-id") === "web" ? "edited" : "missing"}`), node.querySelector(".node__badge")?.textContent])).toEqual([
      ["web", true, "changed"],
      ["api", true, "missing"],
    ]);
    const header = document.querySelector<HTMLElement>(".freshness")!;
    expect([header.hidden, header.textContent]).toEqual([false, "2 of 2 boxes changed since this map (abc1234, 2 days ago) · Refresh"]);
  });

  test("fresh and moved boxes carry no badge, and badges survive a reload", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    send({ type: "freshness", boxes: { web: "moved", api: "edited" }, header: "1 of 2 boxes changed since this map" });
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(vi.mocked(layoutDiagram).mock.calls.length).toBe(2));
    await vi.waitFor(() => expect(document.querySelectorAll(".node__badge").length).toBe(1));
    expect(document.querySelector('.node[data-id="web"] .node__badge')).toBeNull();
    expect(document.querySelector('.node[data-id="api"] .node__badge')?.textContent).toBe("changed");
  });
});

describe("FRS-04 change overlay", () => {
  beforeEach(() => send({ type: "changes", overlay: null }));

  test("touched boxes are strong, others in the same files weak, and uncited files listed; Clear posts", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(document.querySelector<HTMLElement>(".changes")!.hidden).toBe(true);
    send({ type: "changes", overlay: { scope: "Uncommitted changes", strong: ["web"], weak: ["api"], uncovered: ["README.md", "<b>x</b>.ts"] } });
    expect(document.querySelector('.node[data-id="web"]')!.classList.contains("node--change-strong")).toBe(true);
    expect(document.querySelector('.node[data-id="api"]')!.classList.contains("node--change-weak")).toBe(true);
    expect(document.querySelector(".changes__summary")!.firstChild!.textContent).toBe("Uncommitted changes: 1 box touched, 1 more in the same files");
    expect(document.querySelector(".changes__uncovered summary")!.textContent).toBe("Not on the map: 2 files");
    expect([...document.querySelectorAll(".changes__uncovered li")].map((item) => item.textContent)).toEqual(["README.md", "<b>x</b>.ts"]);
    expect(document.querySelector(".changes b")).toBeNull();
    document.querySelector<HTMLButtonElement>(".changes__clear")!.click();
    expect(posted).toEqual([{ type: "clearChanges" }]);
    send({ type: "changes", overlay: null });
    expect(document.querySelectorAll(".node--change-strong, .node--change-weak").length).toBe(0);
    expect(document.querySelector<HTMLElement>(".changes")!.hidden).toBe(true);
  });
});

test("FRS-06 the freshness header's Refresh posts refresh", async () => {
  send({ type: "load", doc: DOC_A, file: "/r/a.json" });
  await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
  send({ type: "freshness", boxes: { web: "edited" }, header: "1 of 2 boxes changed since this map" });
  expect(document.querySelector(".freshness")!.textContent).toBe("1 of 2 boxes changed since this map · Refresh");
  document.querySelector<HTMLButtonElement>(".freshness__refresh")!.click();
  expect(posted).toEqual([{ type: "refresh" }]);
  send({ type: "freshness", boxes: {}, header: null });
});

describe("PRC-02 ghost boxes", () => {
  test("new box candidates are drawn as dashed boxes without a box menu, kept across reloads and cleared", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    send({ type: "ghosts", ghosts: [{ label: "payments", files: 3 }] });
    await vi.waitFor(() => expect(document.querySelectorAll(".node--ghost").length).toBe(1));
    const ghost = document.querySelector(".node--ghost")!;
    expect(ghost.getAttribute("data-id")).toBe("ghost:0");
    expect([...ghost.querySelectorAll("text")].map((text) => text.textContent)).toEqual(["payments", "3 new files"]);
    expect(JSON.parse(ghost.getAttribute("data-vscode-context")!)).toEqual({ webviewSection: "ghost", preventDefaultContextMenuItems: true });
    expect(document.querySelectorAll(".node").length).toBe(3);

    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node--ghost").length).toBe(1));
    send({ type: "ghosts", ghosts: [] });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(document.querySelectorAll(".node--ghost").length).toBe(0);
  });
});

describe("ACC-03 ACC-05 uncertainty on the map", () => {
  const DOC = {
    meta: { title: "Shop" },
    components: [
      { id: "web", label: "Web", type: "frontend" },
      { id: "api", label: "API", type: "backend" },
      { id: "db", label: "DB", type: "database" },
      { id: "jobs", label: "Jobs", type: "backend" },
    ],
    connections: [
      { from: "web", to: "api", label: "calls" },
      { from: "api", to: "db" },
      { from: "api", to: "jobs", label: "starts" },
    ],
  };
  const EVIDENCE = { schema: 1, findings: [{ code: "DeclarationOnly", pointer: "/components/2", component: "db", message: "x" }, { code: "UnsupportedEdge", pointer: "/connections/1", message: "x" }, { code: "UnsupportedEdge", pointer: "/connections/2", message: "x" }] };
  const AUDIT = { schema: 1, createdAt: "2026-10-18T12:00:00Z", boxes: [{ component: "web", verdict: "supports", reason: "ok" }, { component: "api", verdict: "partial", reason: "Returns a constant." }, { component: "jobs", verdict: "contradicts", reason: "Sends mail." }], arrows: [] };
  const labels = (): (string | null)[] => [...document.querySelectorAll(".edge-label")].map((label) => label.textContent);

  test("doubtful boxes are dotted, unbacked arrows grey, dashed and labelled, and a legend says what both mean", async () => {
    send({ type: "load", doc: DOC, file: "/r/shop.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(4));
    const { boxes, edges } = uncertainty(EVIDENCE, AUDIT);
    expect(boxes).toEqual({ db: "Its citations only declare something.", api: "The audit found it partial: Returns a constant.", jobs: "The audit found the code contradicts it: Sends mail." });
    send({ type: "uncertainty", boxes, edges, shown: true });
    await vi.waitFor(() => expect(labels()).toEqual(["calls", "no import evidence", "starts · no import evidence"]));
    expect([...document.querySelectorAll(".node--doubtful")].map((node) => node.getAttribute("data-id"))).toEqual(["api", "db", "jobs"]);
    expect([...document.querySelectorAll(".edge.edge--unsupported")].map((edge) => edge.getAttribute("data-index"))).toEqual(["1", "2"]);
    expect(document.querySelector(".edge[data-index='1']")!.classList.contains("edge--dashed")).toBe(true);
    const legend = document.querySelector<HTMLElement>(".checks-legend")!;
    expect(legend.hidden).toBe(false);
    expect([...legend.querySelectorAll(".checks-legend__row:not([hidden])")].map((row) => row.textContent)).toEqual(["Dotted box: its evidence is in doubt. Hover it for the reason.", "Grey dashed arrow: no import path backs it."]);
  });

  test("the Checks toggle hides them all, and the arrows get their own labels back", async () => {
    send({ type: "load", doc: DOC, file: "/r/shop.json" });
    const { boxes, edges } = uncertainty(EVIDENCE, AUDIT);
    send({ type: "uncertainty", boxes, edges, shown: true });
    await vi.waitFor(() => expect(document.querySelectorAll(".edge--unsupported").length).toBeGreaterThan(0));
    send({ type: "uncertainty", boxes, edges, shown: false });
    await vi.waitFor(() => expect(labels()).toEqual(["calls", "starts"]));
    expect(document.querySelectorAll(".node--doubtful, .edge--unsupported").length).toBe(0);
    expect(document.querySelector<HTMLElement>(".checks-legend")!.hidden).toBe(true);
  });
});

describe("ARC-01 ARC-02 rule violations on the map", () => {
  test("violations are red arrows labelled with the rules, and only the map's own arrows have the arrow menu", async () => {
    const doc = {
      meta: { title: "Rules" },
      components: [
        { id: "api", label: "API", type: "backend" },
        { id: "store", label: "Store", type: "database" },
      ],
      connections: [{ from: "store", to: "api", label: "notifies" }],
    };
    send({ type: "load", doc, file: "/r/rules.json" });
    send({ type: "violations", arrows: [{ from: "api", to: "store", label: "api-not-store" }, { from: "api", to: "gone", label: "x" }] });
    await vi.waitFor(() => expect(document.querySelectorAll(".edge.edge--violation").length).toBe(1));
    const labels = [...document.querySelectorAll(".edge-label")].map((label) => [label.textContent, label.classList.contains("edge--violation")]);
    expect(labels).toEqual([["notifies", false], ["api-not-store", true]]);
    const contexts = [...document.querySelectorAll(".edge")].map((edge) => JSON.parse(edge.getAttribute("data-vscode-context")!).webviewSection);
    expect(contexts).toEqual(["arrow", "ghost"]);
    send({ type: "violations", arrows: [] });
    await vi.waitFor(() => expect(document.querySelectorAll(".edge").length).toBe(1));
  });
});

describe("ARC-03 hotspots on the map", () => {
  test("the toggle tints boxes by their heat level and adds each box's figures to its tooltip", async () => {
    const doc = { meta: { title: "Heat" }, components: [{ id: "api", label: "API", type: "backend" }, { id: "store", label: "Store", type: "database" }, { id: "ui", label: "UI", type: "frontend" }] };
    send({ type: "load", doc, file: "/r/heat.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    const boxes = { api: { level: 4, note: "9 commits, 120 lines changed, 3 authors in the last 90 days." }, store: { level: 2, note: "4 commits, 20 lines changed, 1 author in the last 90 days." }, ui: { level: 0, note: "0 commits, 0 lines changed, 0 authors in the last 90 days." } };
    const heat = (): (string | null)[] => [...document.querySelectorAll(".node")].map((node) => [...node.classList].find((name) => name.startsWith("node--heat-")) ?? null);
    send({ type: "hotspots", boxes, shown: true });
    expect(heat()).toEqual(["node--heat-4", "node--heat-2", null]);
    const before = document.querySelector(".node");
    send({ type: "load", doc, file: "/r/heat.json" });
    await vi.waitFor(() => expect(document.querySelector(".node")).not.toBe(before));
    expect(heat()).toEqual(["node--heat-4", "node--heat-2", null]);
    send({ type: "hotspots", boxes, shown: false });
    expect(heat()).toEqual([null, null, null]);
  });
});

describe("FRS-07 compare maps", () => {
  const BEFORE = {
    components: [
      { id: "api", label: "API", sources: [{ path: "src/api/a.ts" }] },
      { id: "cache", label: "Cache", sources: [{ path: "src/cache/a.ts" }] },
    ],
    connections: [{ from: "api", to: "cache", label: "reads" }],
  };
  const AFTER = {
    meta: { title: "Now" },
    components: [
      { id: "api", label: "Server", type: "backend", sources: [{ path: "src/api/a.ts" }] },
      { id: "mail", label: "Mail", type: "external", sources: [{ path: "src/mail/a.ts" }] },
    ],
    connections: [{ from: "api", to: "mail" }],
  };

  test("added boxes and arrows are outlined, removed ones are drawn see-through, and the bar sums it up with Clear", async () => {
    send({ type: "load", doc: AFTER, file: "/r/now.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    const diff = diffMaps(BEFORE, { components: AFTER.components, connections: AFTER.connections });
    send({ type: "compare", compare: { against: "architecture-old-20261001-090000", diff } });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    const node = (id: string): Element => document.querySelector(`.node[data-id="${id}"]`)!;
    expect(node("mail").classList.contains("node--added")).toBe(true);
    expect(node("api").classList.contains("node--added")).toBe(false);
    expect(node("removed:0").classList.contains("node--removed")).toBe(true);
    expect([...node("removed:0").querySelectorAll("text")].map((text) => text.textContent)).toEqual(["Cache", "removed"]);
    expect(JSON.parse(node("removed:0").getAttribute("data-vscode-context")!).webviewSection).toBe("ghost");
    expect(document.querySelector('.edge[data-index="0"]')!.classList.contains("edge--added")).toBe(true);
    const removed = document.querySelector('.edge[data-index="1"]')!;
    expect([removed.classList.contains("edge--removed"), removed.getAttribute("data-from"), removed.getAttribute("data-to")]).toEqual([true, "api", "removed:0"]);
    const bar = document.querySelector<HTMLElement>(".compare")!;
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toBe("Compared with architecture-old-20261001-090000: 1 box added · 1 removed · 1 relabelled · 1 arrow added · 1 removed Clear");
    posted.length = 0;
    bar.querySelector("button")!.click();
    expect(posted).toEqual([{ type: "clearCompare" }]);
    send({ type: "compare", compare: null });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    expect(bar.hidden).toBe(true);
    expect(document.querySelectorAll(".node--added, .edge--added").length).toBe(0);
  });
});

describe("SKL-02 tour player", () => {
  const HOSTILE_TITLE = '<img src=x onerror="alert(1)">';
  const STOPS = [
    { component: "web", title: HOSTILE_TITLE, explanation: "The web box renders the page.", question: "What does web call?", answer: "The API, on its first line.", citation: { path: "web/src/main.ts", line: 1 } },
    { component: "api", title: "The API", explanation: "It answers each request.", question: "What does it return?", answer: "JSON.", citation: { path: "api/a.ts", line: 3, end_line: 9 } },
  ];
  const card = (): HTMLElement => document.querySelector<HTMLElement>(".tour")!;
  const press = (label: string): void => [...card().querySelectorAll("button")].find((node) => node.textContent === label)!.click();
  const toured = (): string[] => [...document.querySelectorAll(".node--tour")].map((node) => node.getAttribute("data-id")!);

  test("each stop highlights its box, asks the host to open its code, explains and asks, and shows the answer when asked", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    const start = document.querySelector<HTMLButtonElement>(".tour__start")!;
    expect(start.hidden).toBe(true);
    send({ type: "tour", stops: STOPS });
    expect(start.hidden).toBe(false);
    posted.length = 0;
    start.click();
    expect(card().hidden).toBe(false);
    expect([".tour__step", ".tour__title", ".tour__explanation", ".tour__question", ".tour__code"].map((selector) => card().querySelector(selector)!.textContent)).toEqual([
      "Stop 1 of 2",
      HOSTILE_TITLE,
      "The web box renders the page.",
      "Question: What does web call?",
      "web/src/main.ts:1",
    ]);
    expect(card().querySelector("img")).toBeNull();
    expect(toured()).toEqual(["web"]);
    expect(posted).toEqual([{ type: "tourStop", index: 0 }]);
    const answer = (): HTMLElement => card().querySelector<HTMLElement>(".tour__answer")!;
    expect(answer().hidden).toBe(true);
    press("Show answer");
    expect(answer().hidden).toBe(false);
    press("web/src/main.ts:1");
    expect(posted.at(-1)).toEqual({ type: "openTourCode", index: 0 });

    press("Next");
    expect(card().querySelector(".tour__step")!.textContent).toBe("Stop 2 of 2");
    expect(toured()).toEqual(["api"]);
    expect(posted.at(-1)).toEqual({ type: "tourStop", index: 1 });
    expect(answer().hidden).toBe(true);
    const before = document.querySelector(".node");
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelector(".node")).not.toBe(before));
    expect(toured()).toEqual(["api"]);
    press("Back");
    expect(toured()).toEqual(["web"]);
    press("Next");
    press("Finish");
    expect(card().hidden).toBe(true);
    expect(toured()).toEqual([]);
  });

  test("the title bar's Tour plays from the first stop, and a map without a tour ends it", async () => {
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    send({ type: "tour", stops: STOPS });
    send({ type: "playTour" });
    expect(card().querySelector(".tour__step")!.textContent).toBe("Stop 1 of 2");
    send({ type: "tour", stops: null });
    expect(card().hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>(".tour__start")!.hidden).toBe(true);
    expect(toured()).toEqual([]);
  });
});

describe("SKL-03 finished tours", () => {
  test("Finish on the last stop tells the host the tour was finished, and End tour does not", async () => {
    const stop = { component: "web", title: "Web", explanation: "E", question: "Q", answer: "A", citation: { path: "web/src/main.ts", line: 1 } };
    send({ type: "load", doc: DOC_A, file: "/r/a.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    send({ type: "tour", stops: [stop, { ...stop, component: "api" }] });
    const press = (label: string): void => [...document.querySelectorAll<HTMLButtonElement>(".tour button")].find((node) => node.textContent === label)!.click();
    send({ type: "playTour" });
    press("End tour");
    expect(posted.some((message) => message.type === "tourFinished")).toBe(false);
    send({ type: "playTour" });
    press("Next");
    posted.length = 0;
    press("Finish");
    expect(posted).toEqual([{ type: "tourFinished" }]);
  });
});

describe("VWR-03 finder", () => {
  const DOC = {
    meta: { title: "Find" },
    components: [
      { id: "api", label: "Orders API", sublabel: "REST", type: "backend", sources: [{ path: "src/orders/handler.ts" }] },
      { id: "db", label: "Store", sublabel: "Postgres", type: "database", sources: [{ path: "db/schema.sql" }] },
      { id: "web", label: "Shop", sublabel: "orders page", type: "frontend", sources: [{ path: "web/src/main.ts" }] },
    ],
  };
  const key = (target: EventTarget, init: KeyboardEventInit): void => void target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  const finder = (): HTMLElement => document.querySelector<HTMLElement>(".finder")!;
  const input = (): HTMLInputElement => finder().querySelector<HTMLInputElement>("input")!;
  const found = (): string[] => [...document.querySelectorAll(".node--found")].map((node) => node.getAttribute("data-id")!);
  const current = (): string | null => document.querySelector(".node--found-current")?.getAttribute("data-id") ?? null;
  const type = (text: string): void => {
    input().value = text;
    input().dispatchEvent(new Event("input"));
  };

  test("/ opens the finder, typing marks boxes by label, sublabel or cited path, and the rest are dimmed", async () => {
    send({ type: "load", doc: DOC, file: "/r/find.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    expect(finder().hidden).toBe(true);
    key(window, { key: "/" });
    expect(finder().hidden).toBe(false);
    expect(document.activeElement).toBe(input());
    // Keys typed into the finder are text, not the map's zoom keys.
    const view = transform();
    key(input(), { key: "f" });
    key(input(), { key: "-" });
    expect(transform()).toBe(view);
    type("orders");
    expect(found()).toEqual(["api", "web"]);
    expect(app().classList.contains("app--finding")).toBe(true);
    expect(finder().querySelector(".finder__count")!.textContent).toBe("1 of 2");
    type("SCHEMA.sql");
    expect(found()).toEqual(["db"]);
    type("nothing like it");
    expect(found()).toEqual([]);
    expect(finder().querySelector(".finder__count")!.textContent).toBe("No match");
    key(input(), { key: "Escape" });
    expect(finder().hidden).toBe(true);
    expect(app().classList.contains("app--finding")).toBe(false);
  });

  test("Ctrl+F opens it too; Enter centres and zooms on the match, and the arrow keys cycle", async () => {
    send({ type: "load", doc: DOC, file: "/r/find.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(3));
    key(window, { key: "f", ctrlKey: true });
    expect(finder().hidden).toBe(false);
    type("orders");
    const before = transform();
    key(input(), { key: "Enter" });
    expect(current()).toBe("api");
    const centred = transform();
    expect(centred).not.toBe(before);
    const box = document.querySelector('.node[data-id="api"] .node__box')!;
    const [x, y, w, h] = ["x", "y", "width", "height"].map((name) => Number(box.getAttribute(name)));
    const [, tx, ty, scale] = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(centred!)!.map(Number);
    expect(tx! + (x! + w! / 2) * scale!).toBeCloseTo(400);
    expect(ty! + (y! + h! / 2) * scale!).toBeCloseTo(300);
    key(input(), { key: "ArrowDown" });
    expect(current()).toBe("web");
    key(input(), { key: "ArrowDown" });
    expect(current()).toBe("api");
    key(input(), { key: "ArrowUp" });
    expect(current()).toBe("web");
    key(input(), { key: "Escape" });
  });
});

describe("VWR-04 keyboard and screen readers", () => {
  const DOC = {
    meta: { title: "Keys" },
    components: [
      { id: "web", label: "Web", sublabel: "React app", type: "frontend", sources: [{ path: "web/src/main.ts", line: 4, end_line: 9 }] },
      { id: "api", label: "API", type: "backend" },
    ],
    connections: [{ from: "web", to: "api", label: "calls" }],
  };

  test("each box takes focus, names what it is and the code it opens, and Enter or Space opens it", async () => {
    send({ type: "load", doc: DOC, file: "/r/keys.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    const nodes = [...document.querySelectorAll<SVGGElement>(".node")];
    expect(nodes.map((node) => [node.getAttribute("tabindex"), node.getAttribute("role"), node.getAttribute("aria-label")])).toEqual([
      ["0", "button", "Web, React app. Opens web/src/main.ts:4-9"],
      ["0", "button", "API"],
    ]);
    posted.length = 0;
    nodes[0]!.focus();
    nodes[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    nodes[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    nodes[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(posted).toEqual([
      { type: "openSource", componentId: "web", index: 0 },
      { type: "openSource", componentId: "web", index: 0 },
    ]);
  });

  test("a hidden list names every box and arrow, and its buttons open the code", async () => {
    send({ type: "load", doc: DOC, file: "/r/keys.json" });
    await vi.waitFor(() => expect(document.querySelectorAll(".node").length).toBe(2));
    const list = document.querySelector<HTMLElement>(".sr-map")!;
    expect(list.classList.contains("sr-only")).toBe(true);
    expect([...list.querySelectorAll("h2")].map((node) => node.textContent)).toEqual(["2 boxes", "1 arrow"]);
    expect([...list.querySelectorAll("li")].map((node) => node.textContent)).toEqual(["Web, React app. Opens web/src/main.ts:4-9", "API", "Web to API, calls"]);
    posted.length = 0;
    list.querySelector("button")!.click();
    expect(posted).toEqual([{ type: "openSource", componentId: "web", index: 0 }]);
  });
});
