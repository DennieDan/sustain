// Edge geometry that ELK does not produce (FR-LAY-04): straight clipped segments in authored
// mode, self-loops in both modes, and label anchors.
import { center } from "./geom";
import type { Point, Rect } from "./scene";

/** How far a self-loop reaches right of its node; below the 20 px compound padding (elk.ts). */
const LOOP_OUT = 16;
/** Half the vertical extent of a self-loop, centred on the node's right side. */
const LOOP_HALF = 10;

/** Where the ray from the centre of `r` towards `toward` leaves `r`. */
function exitPoint(r: Rect, toward: Point): Point {
  const c = center(r);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const t = Math.min(dx === 0 ? Infinity : r.w / 2 / Math.abs(dx), dy === 0 ? Infinity : r.h / 2 / Math.abs(dy));
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Authored mode: the segment between the two boxes' centres, clipped to each box's border. */
export function straightEdge(from: Rect, to: Rect): Point[] {
  return [exitPoint(from, center(to)), exitPoint(to, center(from))];
}

/** A small rectangle off the node's right side, leaving and re-entering the right border. */
export function selfLoop(r: Rect): Point[] {
  const right = r.x + r.w;
  const cy = r.y + r.h / 2;
  return [
    { x: right, y: cy - LOOP_HALF },
    { x: right + LOOP_OUT, y: cy - LOOP_HALF },
    { x: right + LOOP_OUT, y: cy + LOOP_HALF },
    { x: right, y: cy + LOOP_HALF },
  ];
}

/** Midpoint of the longest segment of a polyline; the first one wins ties. */
export function labelAnchor(points: readonly Point[]): Point {
  let best = 0;
  let bestLength = -1;
  for (let i = 0; i + 1 < points.length; i++) {
    const length = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
    if (length > bestLength) {
      best = i;
      bestLength = length;
    }
  }
  const a = points[best]!;
  const b = points[best + 1] ?? a;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
