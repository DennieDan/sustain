// Boundary nesting and rectangles (FR-LAY-03).
import type { ViewDiagram } from "../model/tolerant";
import { boundingBox, pad } from "./geom";
import type { Rect } from "./scene";

/** Authored mode: padding left, top and right of a boundary rectangle (Archify). */
const AUTHORED_PAD_SIDE = 30;
/** Authored mode: padding below, leaving room for the label (Archify). */
const AUTHORED_PAD_BOTTOM = 50;
/** Auto mode: padding of a boundary that is not placed in the ELK hierarchy. */
const OVERLAY_PAD = 16;

/** Member component indices of each boundary. */
export function memberSets(diagram: ViewDiagram, indexOf: ReadonlyMap<string, number>): Set<number>[] {
  return diagram.boundaries.map((b) => new Set(b.wraps.map((id) => indexOf.get(id)!)));
}

function isSubset(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** `outer` contains every member of `inner` and more. */
function strictSuperset(outer: ReadonlySet<number>, inner: ReadonlySet<number>): boolean {
  return outer.size > inner.size && isSubset(inner, outer);
}

/** Index of the smallest set among `candidates` that strictly contains `members`; later indices win ties. */
function smallestStrictSuperset(members: ReadonlySet<number>, sets: readonly Set<number>[], candidates: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const c of candidates) {
    const set = sets[c]!;
    if (strictSuperset(set, members) && (best === undefined || set.size <= sets[best]!.size)) best = c;
  }
  return best;
}

export interface Hierarchy {
  /** Boundary indices placed in the ELK hierarchy, in document order. */
  placed: number[];
  /** Per boundary: its parent boundary in the hierarchy (placed boundaries only). */
  parent: (number | undefined)[];
  /** Per component: the smallest placed boundary containing it. */
  componentParent: (number | undefined)[];
}

/**
 * Auto mode nesting: in document order, a boundary is placed when its member set is disjoint
 * from, strictly contains, or is strictly contained by every already-placed boundary. Placed
 * sets form a laminar family, so every smallest superset is unique.
 */
export function hierarchy(sets: readonly Set<number>[], componentCount: number): Hierarchy {
  const placed: number[] = [];
  sets.forEach((set, b) => {
    const compatible = placed.every((p) => {
      const other = sets[p]!;
      return strictSuperset(set, other) || strictSuperset(other, set) || [...set].every((x) => !other.has(x));
    });
    if (compatible) placed.push(b);
  });
  const parent = sets.map((set, b) => (placed.includes(b) ? smallestStrictSuperset(set, sets, placed) : undefined));
  const componentParent: (number | undefined)[] = [];
  for (let c = 0; c < componentCount; c++) {
    let best: number | undefined;
    for (const p of placed) if (sets[p]!.has(c) && (best === undefined || sets[p]!.size < sets[best]!.size)) best = p;
    componentParent.push(best);
  }
  return { placed, parent, componentParent };
}

/** Auto mode: rectangle of a boundary outside the hierarchy, around its members' boxes. */
export function overlayRect(members: ReadonlySet<number>, nodes: readonly Rect[]): Rect {
  const inner = boundingBox([...members].map((c) => nodes[c]!))!;
  return pad(inner, OVERLAY_PAD, OVERLAY_PAD, OVERLAY_PAD, OVERLAY_PAD);
}

/**
 * Authored mode: every boundary is a rectangle around its members' boxes and the rectangles of
 * the boundaries it most tightly strictly contains (its children), padded 30 px left, top and
 * right and 50 px below.
 */
export function authoredBoundaryRects(sets: readonly Set<number>[], nodes: readonly Rect[]): Rect[] {
  const all = sets.map((_, b) => b);
  const parent = sets.map((set) => smallestStrictSuperset(set, sets, all));
  const rects: (Rect | undefined)[] = [];
  // A parent is strictly larger than its child, so the recursion terminates.
  const rectOf = (b: number): Rect => {
    const known = rects[b];
    if (known) return known;
    const parts = [...sets[b]!].map((c) => nodes[c]!);
    parent.forEach((p, child) => {
      if (p === b) parts.push(rectOf(child));
    });
    const rect = pad(boundingBox(parts)!, AUTHORED_PAD_SIDE, AUTHORED_PAD_SIDE, AUTHORED_PAD_SIDE, AUTHORED_PAD_BOTTOM);
    rects[b] = rect;
    return rect;
  };
  return all.map(rectOf);
}
