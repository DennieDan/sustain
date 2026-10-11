// Viewport of the diagram canvas (FR-VIEW-06): pure math plus the DOM wiring for drag, wheel,
// pinch, toolbar buttons and keys. `screen = diagram × scale + (x, y)`, in panel pixels.
import type { Point, Rect } from "../src/layout/scene";

export interface ViewState {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 4;
/** Factor of one toolbar or key zoom step. */
export const ZOOM_STEP = 1.25;
/** Panel pixels kept free around the fitted scene bounds. */
export const FIT_PADDING = 24;
/** Zoom per wheel pixel with Ctrl/⌘ or pinch: `factor = exp(-deltaPx × WHEEL_ZOOM_RATE)`. */
const WHEEL_ZOOM_RATE = 0.005;
/** One wheel event zooms by at most `exp(±0.5)`. */
const WHEEL_ZOOM_MAX_PX = 100;
/** Pixels per wheel line when `deltaMode` is lines. */
const WHEEL_LINE_PX = 16;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The view that shows `bounds` centred in `size`, at the largest scale that fits within 10–400 %. */
export function fitView(bounds: Rect, size: Size): ViewState {
  const availW = Math.max(1, size.width - 2 * FIT_PADDING);
  const availH = Math.max(1, size.height - 2 * FIT_PADDING);
  const scale = bounds.w > 0 && bounds.h > 0 ? clampScale(Math.min(availW / bounds.w, availH / bounds.h)) : 1;
  return {
    x: size.width / 2 - (bounds.x + bounds.w / 2) * scale,
    y: size.height / 2 - (bounds.y + bounds.h / 2) * scale,
    scale,
  };
}

/** Multiplies the scale by `factor` (clamped to 10–400 %), keeping the diagram point under `anchor` fixed. */
export function zoomAt(view: ViewState, factor: number, anchor: Point): ViewState {
  if (!Number.isFinite(factor) || factor <= 0) return view;
  const scale = clampScale(view.scale * factor);
  const diagramX = (anchor.x - view.x) / view.scale;
  const diagramY = (anchor.y - view.y) / view.scale;
  return { x: anchor.x - diagramX * scale, y: anchor.y - diagramY * scale, scale };
}

export function panBy(view: ViewState, dx: number, dy: number): ViewState {
  return { x: view.x + dx, y: view.y + dy, scale: view.scale };
}

/** Keyboard shortcuts → toolbar `data-action`. */
const KEY_ACTIONS: Record<string, string> = { "+": "zoom-in", "=": "zoom-in", "-": "zoom-out", "0": "reset", f: "fit", F: "fit" };

/**
 * Owns the view of one canvas: applies it as the content group's `transform` and wires
 * drag-to-pan on empty canvas (anything outside a `.node`), wheel pan, Ctrl/⌘ + wheel and
 * pinch zoom, the toolbar buttons (`data-action` = `fit`, `zoom-out`, `zoom-in`, `reset`) and
 * the keys `+`/`=`, `-`, `0`, `f` on `keyTarget`.
 */
export class ViewportController {
  view: ViewState = { x: 0, y: 0, scale: 1 };
  /** Scene bounds to fit; `undefined` while nothing is drawn. */
  bounds: Rect | undefined;
  /** Called after every view change (e.g. to hide the tooltip). */
  onChange: (() => void) | undefined;
  private drag: { pointerId: number; lastX: number; lastY: number } | undefined;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly content: SVGGElement,
    toolbar: HTMLElement,
    keyTarget: Window,
  ) {
    svg.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    svg.addEventListener("pointermove", (event) => this.onPointerMove(event));
    svg.addEventListener("pointerup", (event) => this.onPointerEnd(event));
    svg.addEventListener("pointercancel", (event) => this.onPointerEnd(event));
    svg.addEventListener("wheel", (event) => this.onWheel(event), { passive: false });
    toolbar.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-action]") : null;
      if (button) this.runAction(button.getAttribute("data-action"));
    });
    keyTarget.addEventListener("keydown", (event) => this.onKey(event));
  }

  /** Panel size in pixels. */
  size(): Size {
    const rect = this.svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  set(view: ViewState): void {
    this.view = view;
    this.content.setAttribute("transform", `translate(${view.x} ${view.y}) scale(${view.scale})`);
    this.onChange?.();
  }

  fit(): void {
    if (this.bounds) this.set(fitView(this.bounds, this.size()));
  }

  /** Zooms by `factor` around the panel centre. */
  private zoomCentred(factor: number): void {
    const { width, height } = this.size();
    this.set(zoomAt(this.view, factor, { x: width / 2, y: height / 2 }));
  }

  private runAction(action: string | null): void {
    switch (action) {
      case "fit":
        this.fit();
        break;
      case "zoom-in":
        this.zoomCentred(ZOOM_STEP);
        break;
      case "zoom-out":
        this.zoomCentred(1 / ZOOM_STEP);
        break;
      case "reset":
        this.zoomCentred(1 / this.view.scale);
        break;
    }
  }

  private onKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const name = KEY_ACTIONS[event.key];
    if (name === undefined) return;
    event.preventDefault();
    this.runAction(name);
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".node")) return;
    this.drag = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
    this.svg.setPointerCapture(event.pointerId);
    this.svg.classList.add("canvas--panning");
  }

  private onPointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    this.set(panBy(this.view, dx, dy));
  }

  private onPointerEnd(event: PointerEvent): void {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag = undefined;
    if (this.svg.hasPointerCapture(event.pointerId)) this.svg.releasePointerCapture(event.pointerId);
    this.svg.classList.remove("canvas--panning");
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? WHEEL_LINE_PX : event.deltaMode === 2 ? this.size().height : 1;
    let dx = event.deltaX * unit;
    let dy = event.deltaY * unit;
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/⌘ + wheel, and trackpad pinch (which browsers report as a wheel with ctrlKey).
      const rect = this.svg.getBoundingClientRect();
      const px = Math.min(WHEEL_ZOOM_MAX_PX, Math.max(-WHEEL_ZOOM_MAX_PX, dy));
      this.set(zoomAt(this.view, Math.exp(-px * WHEEL_ZOOM_RATE), { x: event.clientX - rect.left, y: event.clientY - rect.top }));
      return;
    }
    if (event.shiftKey && dx === 0) [dx, dy] = [dy, 0];
    this.set(panBy(this.view, -dx, -dy));
  }
}
