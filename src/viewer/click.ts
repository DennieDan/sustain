// Node clicks (FR-NAV-01): a press and release on the same node with less than 4 px of pointer
// movement opens the component's first source.
import type { WebviewMessage } from "./protocol";

/** Pointer movement below this many pixels counts as a click, not a drag. */
export const CLICK_SLOP_PX = 4;

interface Press {
  pointerId: number;
  componentId: string;
  x: number;
  y: number;
}

function nodeId(target: EventTarget | null): string | undefined {
  const node = target instanceof Element ? target.closest(".node") : null;
  return node?.getAttribute("data-id") ?? undefined;
}

/** Wires click detection on `.node[data-id]` elements inside `canvas`. */
export class NodeClicks {
  private press: Press | undefined;

  constructor(canvas: SVGSVGElement, post: (message: WebviewMessage) => void) {
    canvas.addEventListener("pointerdown", (event) => {
      const componentId = event.button === 0 ? nodeId(event.target) : undefined;
      this.press = componentId === undefined ? undefined : { pointerId: event.pointerId, componentId, x: event.clientX, y: event.clientY };
    });
    canvas.addEventListener("pointerup", (event) => {
      const press = this.press;
      this.press = undefined;
      if (!press || press.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) >= CLICK_SLOP_PX) return;
      if (nodeId(event.target) !== press.componentId) return;
      post({ type: "openSource", componentId: press.componentId, index: 0 });
    });
    canvas.addEventListener("pointercancel", () => {
      this.press = undefined;
    });
  }
}
