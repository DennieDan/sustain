// Rectangle helpers in diagram space (pixels, y down). Browser-safe.
import type { Point, Rect } from "./scene";

export function center(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Smallest rectangle containing every input; `undefined` for none. */
export function boundingBox(rects: Iterable<Rect>): Rect | undefined {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.w);
    bottom = Math.max(bottom, r.y + r.h);
  }
  return left === Infinity ? undefined : { x: left, y: top, w: right - left, h: bottom - top };
}

/** `r` grown by the given padding on each side. */
export function pad(r: Rect, left: number, top: number, right: number, bottom: number): Rect {
  return { x: r.x - left, y: r.y - top, w: r.w + left + right, h: r.h + top + bottom };
}
