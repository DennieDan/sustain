// Auto layout through elkjs (FR-LAY-02): the graph, its options, and absolute geometry back. The
// engine is passed in (VWR-02): ELK's API with a worker on a page, or bundled ELK in the thread.
import type { ElkExtendedEdge, ElkNode, LayoutOptions as ElkOptions } from "elkjs/lib/elk-api.js";
import type { Hierarchy } from "./boundaries";
import type { Point, Rect } from "./scene";

/** What lays an ELK graph out: an `ELK` instance from `elk-api.js` or `elk.bundled.js`. */
export interface ElkEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
}

/** Shared by the root and every compound node: with INCLUDE_CHILDREN, ELK reads spacing per graph. */
const SHARED_OPTIONS: ElkOptions = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.spacing.nodeNode": "60",
  "elk.layered.spacing.nodeNodeBetweenLayers": "110",
  "elk.spacing.edgeNode": "20",
};

/** Room inside a placed boundary: 36 px on top for its label, 20 px on the other sides. */
const COMPOUND_PADDING = "[top=36,left=20,bottom=20,right=20]";

export type Direction = "RIGHT" | "DOWN";

export interface ElkResult {
  /** Per component. */
  nodes: Rect[];
  /** Per boundary; set for placed boundaries only. */
  boundaries: (Rect | undefined)[];
  /** Per connection; set for edges sent to ELK (all but self-loops). */
  edges: (Point[] | undefined)[];
}

export interface ElkInput {
  sizes: readonly { w: number; h: number }[];
  hierarchy: Hierarchy;
  /** Connections as component indices. */
  connections: readonly { from: number; to: number }[];
}

/**
 * Lays the graph out in one direction. ELK ids are `n<i>` (components), `b<i>` (boundaries)
 * and `e<i>` (connections), so document ids never clash. `json.shapeCoords`/`edgeCoords`
 * `ROOT` make every returned coordinate absolute.
 */
export async function runElk(input: ElkInput, direction: Direction, elk: ElkEngine): Promise<ElkResult> {
  const options: ElkOptions = { ...SHARED_OPTIONS, "elk.direction": direction };
  const root: ElkNode = {
    id: "root",
    layoutOptions: {
      ...options,
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
      "org.eclipse.elk.json.shapeCoords": "ROOT",
      "org.eclipse.elk.json.edgeCoords": "ROOT",
    },
    children: [],
    edges: [],
  };
  const { placed, parent, componentParent } = input.hierarchy;
  const compounds = new Map<number, ElkNode>();
  for (const b of placed) compounds.set(b, { id: `b${b}`, layoutOptions: { ...options, "elk.padding": COMPOUND_PADDING }, children: [] });
  const containerOf = (b: number | undefined): ElkNode => (b === undefined ? root : compounds.get(b)!);
  for (const b of placed) containerOf(parent[b]).children!.push(compounds.get(b)!);
  input.sizes.forEach((size, c) => containerOf(componentParent[c]).children!.push({ id: `n${c}`, width: size.w, height: size.h }));
  input.connections.forEach(({ from, to }, e) => {
    if (from !== to) root.edges!.push({ id: `e${e}`, sources: [`n${from}`], targets: [`n${to}`] });
  });

  const laid = await elk.layout(root);
  const result: ElkResult = { nodes: [], boundaries: [], edges: [] };
  const visit = (node: ElkNode): void => {
    const rect = { x: node.x ?? 0, y: node.y ?? 0, w: node.width ?? 0, h: node.height ?? 0 };
    const index = Number(node.id.slice(1));
    if (node.id.startsWith("n")) result.nodes[index] = rect;
    else if (node.id.startsWith("b")) result.boundaries[index] = rect;
    node.children?.forEach(visit);
  };
  laid.children?.forEach(visit);
  for (const edge of laid.edges ?? []) result.edges[Number(edge.id.slice(1))] = sectionPoints(edge);
  return result;
}

/** The polyline of an edge's sections (start, bends, end), joints not repeated. */
function sectionPoints(edge: ElkExtendedEdge): Point[] {
  const points: Point[] = [];
  for (const section of edge.sections ?? []) {
    for (const p of [section.startPoint, ...(section.bendPoints ?? []), section.endPoint]) {
      const last = points.at(-1);
      if (!last || last.x !== p.x || last.y !== p.y) points.push({ x: p.x, y: p.y });
    }
  }
  return points;
}
