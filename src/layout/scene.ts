// The Scene: absolute diagram geometry produced by `layoutDiagram` and drawn by the webview.
// Browser-safe types only.
import type { Direction, ElkInput, ElkResult } from "./elk";
import type { BoundaryKind, ComponentType, Variant } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Width and height of one line of text. */
export interface TextSize {
  width: number;
  height: number;
}

/**
 * Measures one line of text at a font size in px; `bold` for labels. Injected: canvas
 * `measureText` in the webview, a fixed advance in tests.
 */
export type MeasureText = (text: string, sizePx: number, bold: boolean) => TextSize;

export interface SceneNode {
  /** Component id. */
  id: string;
  /** Index into `ViewDiagram.components`. */
  index: number;
  type: ComponentType;
  rect: Rect;
}

export interface SceneBoundary {
  /** Index into `ViewDiagram.boundaries`. */
  index: number;
  kind: BoundaryKind;
  label: string;
  rect: Rect;
  /** Placed in the ELK hierarchy (auto mode); `false` for overlay rectangles and authored mode. */
  nested: boolean;
}

export interface SceneEdge {
  /** Index into `ViewDiagram.connections`. */
  index: number;
  from: string;
  to: string;
  variant: Variant;
  /** Polyline from the `from` box border to the `to` box border (arrowhead at the last point). */
  points: Point[];
  label?: string;
  /** Midpoint of the longest segment, when the connection has a label. */
  labelAt?: Point;
}

export interface Scene {
  mode: "authored" | "auto";
  /** Auto mode: the chosen ELK direction. */
  direction?: "RIGHT" | "DOWN";
  nodes: SceneNode[];
  /** Drawn in this order (outermost first). */
  boundaries: SceneBoundary[];
  edges: SceneEdge[];
  /** Bounding box of everything plus a margin. */
  bounds: Rect;
}

/** VWR-02: runs one direction's ELK layout, in a worker on a page or in the thread in Node. */
export type RunElk = (input: ElkInput, direction: Direction) => Promise<ElkResult>;

export interface LayoutOptions {
  measure: MeasureText;
  /** Size the fit-to-viewport scale is computed for (FR-LAY-02 direction choice). */
  viewport: { width: number; height: number };
  run: RunElk;
}
