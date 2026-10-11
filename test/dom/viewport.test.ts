// FR-VIEW-06: viewport math (zoom clamps, zoom around a point, fit) and its DOM wiring.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FIT_PADDING, MAX_SCALE, MIN_SCALE, ViewportController, ZOOM_STEP, clampScale, fitView, panBy, zoomAt } from "../../webview/viewport";
import type { ViewState } from "../../webview/viewport";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The diagram point shown at panel point `p`. */
function diagramAt(view: ViewState, p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}

describe("FR-VIEW-06 viewport math", () => {
  test("scales are clamped to 10–400 %", () => {
    expect([clampScale(0.01), clampScale(0.1), clampScale(1.5), clampScale(4), clampScale(9)]).toEqual([0.1, 0.1, 1.5, 4, 4]);
  });

  test("zooming in or out repeatedly stops at 400 % and 10 %", () => {
    let view: ViewState = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 20; i++) view = zoomAt(view, ZOOM_STEP, { x: 100, y: 100 });
    expect(view.scale).toBe(MAX_SCALE);
    for (let i = 0; i < 40; i++) view = zoomAt(view, 1 / ZOOM_STEP, { x: 100, y: 100 });
    expect(view.scale).toBe(MIN_SCALE);
    expect(zoomAt({ x: 0, y: 0, scale: 3 }, 100, { x: 0, y: 0 }).scale).toBe(4);
    expect(zoomAt({ x: 0, y: 0, scale: 0.2 }, 0.001, { x: 0, y: 0 }).scale).toBe(0.1);
  });

  test.each([
    [{ x: 0, y: 0, scale: 1 }, 2, { x: 300, y: 200 }],
    [{ x: -120, y: 45, scale: 0.37 }, 1 / ZOOM_STEP, { x: 17, y: 590 }],
    [{ x: 80, y: -30, scale: 2 }, 1000, { x: 640, y: 10 }],
    [{ x: 5, y: 5, scale: 0.3 }, 0.0001, { x: 400, y: 300 }],
  ])("zooming %o by %d keeps the diagram point under %o fixed, even when clamped", (view, factor, anchor) => {
    const before = diagramAt(view, anchor);
    const after = diagramAt(zoomAt(view, factor, anchor), anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  test("invalid zoom factors leave the view unchanged", () => {
    const view = { x: 3, y: 4, scale: 2 };
    expect([zoomAt(view, 0, { x: 0, y: 0 }), zoomAt(view, -2, { x: 0, y: 0 }), zoomAt(view, Number.NaN, { x: 0, y: 0 })]).toEqual([view, view, view]);
  });

  test("fit centres the bounds at the largest scale that fits inside the padding", () => {
    const bounds = { x: 100, y: 50, w: 800, h: 300 };
    const size = { width: 1000, height: 600 };
    const view = fitView(bounds, size);
    // Width-limited: (1000 − 2·24) / 800 = 1.19 < (600 − 48) / 300 = 1.84.
    expect(view.scale).toBeCloseTo((1000 - 2 * FIT_PADDING) / 800);
    const centre = diagramAt(view, { x: 500, y: 300 });
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(200);
    const left = bounds.x * view.scale + view.x;
    expect(left).toBeCloseTo(FIT_PADDING);
  });

  test("fit is height-limited for tall bounds and clamped for tiny and huge ones, still centred", () => {
    const size = { width: 800, height: 600 };
    const tall = fitView({ x: 0, y: 0, w: 100, h: 1104 }, size);
    expect(tall.scale).toBeCloseTo((600 - 2 * FIT_PADDING) / 1104);
    const tiny = fitView({ x: 10, y: 10, w: 20, h: 10 }, size);
    expect(tiny.scale).toBe(MAX_SCALE);
    const huge = fitView({ x: 0, y: 0, w: 100000, h: 100000 }, size);
    expect(huge.scale).toBe(MIN_SCALE);
    for (const [view, cx, cy] of [
      [tiny, 20, 15],
      [huge, 50000, 50000],
    ] as const) {
      const centre = diagramAt(view, { x: 400, y: 300 });
      expect(centre.x).toBeCloseTo(cx);
      expect(centre.y).toBeCloseTo(cy);
    }
  });

  test("pan moves the view by the given pixels at any scale", () => {
    expect(panBy({ x: 10, y: 20, scale: 3 }, -5, 7)).toEqual({ x: 5, y: 27, scale: 3 });
  });
});

describe("FR-VIEW-06 viewport wiring", () => {
  let svg: SVGSVGElement;
  let content: SVGGElement;
  let toolbar: HTMLDivElement;
  let viewport: ViewportController;
  const bounds = { x: 0, y: 0, w: 400, h: 200 };

  beforeEach(() => {
    svg = document.createElementNS(SVG_NS, "svg");
    content = document.createElementNS(SVG_NS, "g");
    const node = document.createElementNS(SVG_NS, "g");
    node.setAttribute("class", "node");
    node.append(document.createElementNS(SVG_NS, "rect"));
    content.append(node);
    svg.append(content);
    svg.getBoundingClientRect = () => new DOMRect(10, 20, 800, 600);
    toolbar = document.createElement("div");
    for (const action of ["fit", "zoom-out", "zoom-in", "reset"]) {
      const button = document.createElement("button");
      button.setAttribute("data-action", action);
      toolbar.append(button);
    }
    document.body.replaceChildren(svg, toolbar);
    viewport = new ViewportController(svg, content, toolbar, window);
    viewport.bounds = bounds;
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  function click(action: string): void {
    toolbar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  }

  function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key: k, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event;
  }

  interface WheelInit {
    deltaX?: number;
    deltaY?: number;
    deltaMode?: number;
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    clientX?: number;
    clientY?: number;
  }

  function wheel(init: WheelInit): WheelEvent {
    const event = new WheelEvent("wheel", { deltaX: init.deltaX ?? 0, deltaY: init.deltaY ?? 0, deltaMode: init.deltaMode ?? 0, cancelable: true });
    // happy-dom's WheelEvent has no modifier or pointer fields.
    Object.defineProperties(event, {
      ctrlKey: { value: init.ctrlKey ?? false },
      metaKey: { value: init.metaKey ?? false },
      shiftKey: { value: init.shiftKey ?? false },
      clientX: { value: init.clientX ?? 0 },
      clientY: { value: init.clientY ?? 0 },
    });
    svg.dispatchEvent(event);
    return event;
  }

  test("set() applies the view as the content group's transform", () => {
    viewport.set({ x: 12, y: -3, scale: 1.5 });
    expect(content.getAttribute("transform")).toBe("translate(12 -3) scale(1.5)");
  });

  test("toolbar Fit, +, − and 100 % change the view; zoom buttons zoom around the panel centre", () => {
    click("fit");
    expect(viewport.view).toEqual(fitView(bounds, { width: 800, height: 600 }));
    const centre = diagramAt(viewport.view, { x: 400, y: 300 });
    click("zoom-in");
    expect(viewport.view.scale).toBeCloseTo(fitView(bounds, { width: 800, height: 600 }).scale * ZOOM_STEP);
    expect(diagramAt(viewport.view, { x: 400, y: 300 }).x).toBeCloseTo(centre.x);
    click("zoom-out");
    click("zoom-out");
    expect(viewport.view.scale).toBeCloseTo(fitView(bounds, { width: 800, height: 600 }).scale / ZOOM_STEP);
    click("reset");
    expect(viewport.view.scale).toBe(1);
    expect(diagramAt(viewport.view, { x: 400, y: 300 }).y).toBeCloseTo(centre.y);
  });

  test("fit does nothing while there are no bounds", () => {
    viewport.bounds = undefined;
    click("fit");
    expect(viewport.view).toEqual({ x: 0, y: 0, scale: 1 });
  });

  test("keys + = - 0 f zoom and fit; with Ctrl, ⌘ or Alt they are left alone", () => {
    expect(key("+").defaultPrevented).toBe(true);
    expect(viewport.view.scale).toBeCloseTo(ZOOM_STEP);
    key("=");
    expect(viewport.view.scale).toBeCloseTo(ZOOM_STEP ** 2);
    key("-");
    expect(viewport.view.scale).toBeCloseTo(ZOOM_STEP);
    key("0");
    expect(viewport.view.scale).toBe(1);
    key("f");
    expect(viewport.view).toEqual(fitView(bounds, { width: 800, height: 600 }));
    const fitted = viewport.view;
    expect(key("+", { ctrlKey: true }).defaultPrevented).toBe(false);
    key("-", { metaKey: true });
    key("0", { altKey: true });
    key("x");
    expect(viewport.view).toEqual(fitted);
  });

  test("wheel scroll pans; Ctrl/⌘ + wheel and pinch zoom around the pointer", () => {
    expect(wheel({ deltaX: 30, deltaY: 50 }).defaultPrevented).toBe(true);
    expect(viewport.view).toEqual({ x: -30, y: -50, scale: 1 });
    wheel({ deltaY: 2, deltaMode: 1 });
    expect(viewport.view).toEqual({ x: -30, y: -82, scale: 1 });
    // Shift + vertical wheel scrolls horizontally.
    wheel({ deltaY: 10, shiftKey: true });
    expect(viewport.view).toEqual({ x: -40, y: -82, scale: 1 });

    // Pointer at client (310, 220) is panel point (300, 200).
    const anchor = diagramAt(viewport.view, { x: 300, y: 200 });
    wheel({ deltaY: -100, ctrlKey: true, clientX: 310, clientY: 220 });
    expect(viewport.view.scale).toBeGreaterThan(1);
    expect(diagramAt(viewport.view, { x: 300, y: 200 }).x).toBeCloseTo(anchor.x);
    expect(diagramAt(viewport.view, { x: 300, y: 200 }).y).toBeCloseTo(anchor.y);
    const zoomed = viewport.view.scale;
    wheel({ deltaY: 40, metaKey: true, clientX: 310, clientY: 220 });
    expect(viewport.view.scale).toBeLessThan(zoomed);
    expect(diagramAt(viewport.view, { x: 300, y: 200 }).x).toBeCloseTo(anchor.x);
  });

  test("ctrl-wheel zoom stays within 10–400 %", () => {
    for (let i = 0; i < 50; i++) wheel({ deltaY: -100, ctrlKey: true });
    expect(viewport.view.scale).toBe(MAX_SCALE);
    for (let i = 0; i < 100; i++) wheel({ deltaY: 100, ctrlKey: true });
    expect(viewport.view.scale).toBe(MIN_SCALE);
  });

  test("dragging empty canvas pans; dragging from a node does not", () => {
    svg.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, button: 0, clientX: 100, clientY: 100, bubbles: true }));
    expect(svg.classList.contains("canvas--panning")).toBe(true);
    svg.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 130, clientY: 90, bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 150, clientY: 120, bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 150, clientY: 120, bubbles: true }));
    expect(viewport.view).toEqual({ x: 50, y: 20, scale: 1 });
    expect(svg.classList.contains("canvas--panning")).toBe(false);

    svg.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 400, clientY: 400, bubbles: true }));
    expect(viewport.view).toEqual({ x: 50, y: 20, scale: 1 });

    const nodeRect = content.querySelector(".node rect")!;
    nodeRect.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, button: 0, clientX: 10, clientY: 10, bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, clientX: 90, clientY: 90, bubbles: true }));
    expect(viewport.view).toEqual({ x: 50, y: 20, scale: 1 });
  });

  test("onChange runs after every view change", () => {
    let calls = 0;
    viewport.onChange = () => calls++;
    click("zoom-in");
    wheel({ deltaY: 10 });
    key("f");
    expect(calls).toBe(3);
  });
});
