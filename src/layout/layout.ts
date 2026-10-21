// Scene construction (FR-LAY-01..04): authored geometry as stored, or ELK auto layout in the
// better-fitting direction, plus boundary rectangles and edge polylines.
import type { ViewDiagram } from "../model/tolerant";
import { authoredBoundaryRects, hierarchy, memberSets, overlayRect } from "./boundaries";
import { labelAnchor, selfLoop, straightEdge } from "./edges";
import type { Direction, ElkInput } from "./elk";
import { boundingBox, pad } from "./geom";
import { autoNodeSize } from "./measure";
import { authoredRects } from "./mode";
import type { LayoutOptions, Point, Rect, Scene, SceneBoundary, SceneEdge } from "./scene";

/** Margin around the drawing: auto layouts start here, and `bounds` adds it on every side. */
const ORIGIN = 40;

interface Geometry {
  nodes: Rect[];
  /** Per boundary. */
  boundaries: { rect: Rect; nested: boolean }[];
  /** Per connection. */
  edges: Point[][];
}

export async function layoutDiagram(diagram: ViewDiagram, options: LayoutOptions): Promise<Scene> {
  const indexOf = new Map(diagram.components.map((c, i) => [c.id, i]));
  const connections = diagram.connections.map((c) => ({ from: indexOf.get(c.from)!, to: indexOf.get(c.to)! }));
  const sets = memberSets(diagram, indexOf);

  const authored = authoredRects(diagram);
  if (authored) {
    const geometry: Geometry = {
      nodes: authored,
      boundaries: authoredBoundaryRects(sets, authored).map((rect) => ({ rect, nested: false })),
      edges: connections.map(({ from, to }) => (from === to ? selfLoop(authored[from]!) : straightEdge(authored[from]!, authored[to]!))),
    };
    return toScene(diagram, geometry, "authored");
  }

  const input: ElkInput = {
    sizes: diagram.components.map((c) => autoNodeSize(c, options.measure)),
    hierarchy: hierarchy(sets, diagram.components.length),
    connections,
  };
  const autoScene = async (direction: Direction): Promise<Scene> => {
    const elk = await options.run(input, direction);
    const boundaries = sets.map((set, b) => {
      const nestedRect = elk.boundaries[b];
      return nestedRect ? { rect: nestedRect, nested: true } : { rect: overlayRect(set, elk.nodes), nested: false };
    });
    const edges = connections.map(({ from, to }, e) => (from === to ? selfLoop(elk.nodes[from]!) : elk.edges[e]!));
    return toScene(diagram, translateToOrigin({ nodes: elk.nodes, boundaries, edges }), "auto", direction);
  };
  // VWR-02: on a page each direction runs in its own worker, so the two lay out in parallel.
  const [right, down] = await Promise.all([autoScene("RIGHT"), autoScene("DOWN")]);
  const fit = (scene: Scene): number => Math.min(options.viewport.width / scene.bounds.w, options.viewport.height / scene.bounds.h);
  return fit(down) > fit(right) ? down : right;
}

/** Moves auto-layout geometry so the drawing's top-left corner sits at (ORIGIN, ORIGIN). */
function translateToOrigin(geometry: Geometry): Geometry {
  const box = drawingBox(geometry);
  const dx = ORIGIN - box.x;
  const dy = ORIGIN - box.y;
  const move = (r: Rect): Rect => ({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
  return {
    nodes: geometry.nodes.map(move),
    boundaries: geometry.boundaries.map(({ rect, nested }) => ({ rect: move(rect), nested })),
    edges: geometry.edges.map((points) => points.map((p) => ({ x: p.x + dx, y: p.y + dy }))),
  };
}

/** Bounding box of nodes, boundaries and edge points. Never empty: a diagram has at least one component. */
function drawingBox(geometry: Geometry): Rect {
  const points = geometry.edges.flat().map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 }));
  return boundingBox([...geometry.nodes, ...geometry.boundaries.map((b) => b.rect), ...points])!;
}

function toScene(diagram: ViewDiagram, geometry: Geometry, mode: Scene["mode"], direction?: Direction): Scene {
  const boundaries: SceneBoundary[] = diagram.boundaries.map((b, index) => ({ index, kind: b.kind, label: b.label, ...geometry.boundaries[index]! }));
  // Outermost first: a containing rectangle is strictly larger than what it contains.
  boundaries.sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h || a.index - b.index);
  const edges: SceneEdge[] = diagram.connections.map((c, index) => {
    const points = geometry.edges[index]!;
    const edge: SceneEdge = { index, from: c.from, to: c.to, variant: c.variant, points };
    if (c.label !== undefined) {
      edge.label = c.label;
      edge.labelAt = labelAnchor(points);
    }
    return edge;
  });
  const scene: Scene = {
    mode,
    nodes: diagram.components.map((c, index) => ({ id: c.id, index, type: c.type, rect: geometry.nodes[index]! })),
    boundaries,
    edges,
    bounds: pad(drawingBox(geometry), ORIGIN, ORIGIN, ORIGIN, ORIGIN),
  };
  if (direction) scene.direction = direction;
  return scene;
}
