// Layout mode selection and Archify grid conversion (FR-LAY-01).
import type { ViewComponent, ViewDiagram } from "../model/tolerant";
import type { GridLayout } from "../model/types";
import type { Rect } from "./scene";

/** Archify's grid defaults (`cols` only matters to Archify's own placement, not to the conversion). */
const GRID_DEFAULTS = { origin: [40, 80], gapX: 30, gapY: 40, cellW: 130, cellH: 64 } as const;
/** Size of an authored component without `size`. */
const DEFAULT_SIZE = [120, 60] as const;

/** The authored rectangle of a component: `pos`, else its grid cell when the root has a grid layout. */
function authoredRect(component: ViewComponent, grid: GridLayout | undefined): Rect | undefined {
  let x: number;
  let y: number;
  if (component.pos) {
    [x, y] = component.pos;
  } else if (grid && component.row !== undefined && component.col !== undefined) {
    const [ox, oy] = grid.origin ?? GRID_DEFAULTS.origin;
    x = ox + component.col * ((grid.cellW ?? GRID_DEFAULTS.cellW) + (grid.gapX ?? GRID_DEFAULTS.gapX));
    y = oy + component.row * ((grid.cellH ?? GRID_DEFAULTS.cellH) + (grid.gapY ?? GRID_DEFAULTS.gapY));
  } else {
    return undefined;
  }
  const [w, h] = component.size ?? DEFAULT_SIZE;
  return { x, y, w, h };
}

/** Authored rectangles in component order when every component has one (authored mode), else `undefined` (auto mode). */
export function authoredRects(diagram: ViewDiagram): Rect[] | undefined {
  const rects: Rect[] = [];
  for (const component of diagram.components) {
    const rect = authoredRect(component, diagram.grid);
    if (!rect) return undefined;
    rects.push(rect);
  }
  return rects;
}
