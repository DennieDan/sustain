// Tolerant reading of Archify documents for the viewer (FR-VIEW-03, ADR 0012). No schema
// validation: whatever can be drawn is kept, the rest is skipped. Browser-safe: no imports
// besides types.
import type { BoundaryKind, ComponentType, GridLayout, Point, SourceRef, Variant } from "./types";

const COMPONENT_TYPES: readonly ComponentType[] = ["frontend", "backend", "database", "cloud", "security", "messagebus", "external"];
const VARIANTS: readonly Variant[] = ["default", "emphasis", "security", "dashed"];

export interface ViewComponent {
  id: string;
  label: string;
  sublabel?: string;
  tag?: string;
  /** Unknown or missing types become `external`. */
  type: ComponentType;
  /** Entries with a string `path`, in document order; `index` in `openSource` refers to this list. */
  sources: SourceRef[];
  pos?: Point;
  size?: [number, number];
  row?: number;
  col?: number;
}

export interface ViewConnection {
  from: string;
  to: string;
  label?: string;
  variant: Variant;
}

export interface ViewBoundary {
  kind: BoundaryKind;
  label: string;
  /** Resolved member IDs, first occurrence order, without duplicates. */
  wraps: string[];
}

export interface ViewDiagram {
  title?: string;
  /** Root `layout`, only when `mode` is `"grid"`. */
  grid?: GridLayout;
  components: ViewComponent[];
  connections: ViewConnection[];
  boundaries: ViewBoundary[];
}

export type TolerantResult =
  | { ok: true; diagram: ViewDiagram; /** What was dropped, as `<pointer>: <reason>` (for tests and logs). */ skipped: string[] }
  | { ok: false; reason: string };

type Obj = Record<string, unknown>;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pair(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [a, b] = [num(value[0]), num(value[1])];
  return a === undefined || b === undefined ? undefined : [a, b];
}

function readSources(value: unknown, pointer: string, skipped: string[]): SourceRef[] {
  if (!Array.isArray(value)) return [];
  const sources: SourceRef[] = [];
  value.forEach((entry, k) => {
    const path = isObj(entry) ? str(entry["path"]) : undefined;
    if (!isObj(entry) || path === undefined) {
      skipped.push(`${pointer}/sources/${k}: no string path`);
      return;
    }
    const source: SourceRef = { path };
    const line = num(entry["line"]);
    const end = num(entry["end_line"]);
    const label = str(entry["label"]);
    if (line !== undefined) source.line = line;
    if (end !== undefined) source.end_line = end;
    if (label !== undefined) source.label = label;
    sources.push(source);
  });
  return sources;
}

function readGrid(value: unknown): GridLayout | undefined {
  if (!isObj(value) || value["mode"] !== "grid") return undefined;
  const grid: GridLayout = { mode: "grid" };
  const origin = pair(value["origin"]);
  if (origin) grid.origin = origin;
  for (const key of ["cols", "gapX", "gapY", "cellW", "cellH"] as const) {
    const n = num(value[key]);
    if (n !== undefined) grid[key] = n;
  }
  return grid;
}

/** Tolerant read of an already parsed JSON value. */
export function readDiagram(value: unknown): TolerantResult {
  if (!isObj(value)) return { ok: false, reason: "the root is not a JSON object" };
  const rawComponents = value["components"];
  if (!Array.isArray(rawComponents) || rawComponents.length === 0) {
    return { ok: false, reason: "it has no components" };
  }
  const skipped: string[] = [];
  const components: ViewComponent[] = [];
  const ids = new Set<string>();
  rawComponents.forEach((raw, i) => {
    const pointer = `/components/${i}`;
    const id = isObj(raw) ? str(raw["id"]) : undefined;
    if (!isObj(raw) || id === undefined) {
      skipped.push(`${pointer}: no string id`);
      return;
    }
    if (ids.has(id)) {
      skipped.push(`${pointer}: duplicate id ${id}`);
      return;
    }
    ids.add(id);
    const type = str(raw["type"]);
    const component: ViewComponent = {
      id,
      label: str(raw["label"]) || id,
      type: COMPONENT_TYPES.includes(type as ComponentType) ? (type as ComponentType) : "external",
      sources: readSources(raw["sources"], pointer, skipped),
    };
    const sublabel = str(raw["sublabel"]);
    const tag = str(raw["tag"]);
    const pos = pair(raw["pos"]);
    const size = pair(raw["size"]);
    const row = num(raw["row"]);
    const col = num(raw["col"]);
    if (sublabel) component.sublabel = sublabel;
    if (tag) component.tag = tag;
    if (pos) component.pos = pos;
    if (size) component.size = size;
    if (row !== undefined) component.row = row;
    if (col !== undefined) component.col = col;
    components.push(component);
  });
  if (components.length === 0) return { ok: false, reason: "it has no components with an id" };

  const connections: ViewConnection[] = [];
  const rawConnections = value["connections"];
  if (Array.isArray(rawConnections)) {
    rawConnections.forEach((raw, i) => {
      const from = isObj(raw) ? str(raw["from"]) : undefined;
      const to = isObj(raw) ? str(raw["to"]) : undefined;
      if (!isObj(raw) || from === undefined || to === undefined || !ids.has(from) || !ids.has(to)) {
        skipped.push(`/connections/${i}: from/to do not resolve`);
        return;
      }
      const variant = str(raw["variant"]);
      const connection: ViewConnection = { from, to, variant: VARIANTS.includes(variant as Variant) ? (variant as Variant) : "default" };
      const label = str(raw["label"]);
      if (label) connection.label = label;
      connections.push(connection);
    });
  }

  const boundaries: ViewBoundary[] = [];
  const rawBoundaries = value["boundaries"];
  if (Array.isArray(rawBoundaries)) {
    rawBoundaries.forEach((raw, i) => {
      const pointer = `/boundaries/${i}`;
      if (!isObj(raw)) {
        skipped.push(`${pointer}: not an object`);
        return;
      }
      const wraps: string[] = [];
      const rawWraps = Array.isArray(raw["wraps"]) ? raw["wraps"] : [];
      rawWraps.forEach((member, j) => {
        if (typeof member === "string" && ids.has(member)) {
          if (!wraps.includes(member)) wraps.push(member);
        } else skipped.push(`${pointer}/wraps/${j}: does not resolve`);
      });
      if (wraps.length === 0) {
        skipped.push(`${pointer}: no members left`);
        return;
      }
      boundaries.push({ kind: raw["kind"] === "security-group" ? "security-group" : "region", label: str(raw["label"]) ?? "", wraps });
    });
  }

  const diagram: ViewDiagram = { components, connections, boundaries };
  const meta = value["meta"];
  const title = isObj(meta) ? str(meta["title"]) : undefined;
  if (title) diagram.title = title;
  const grid = readGrid(value["layout"]);
  if (grid) diagram.grid = grid;
  return { ok: true, diagram, skipped };
}

/** {@link parseDiagram}'s result: a success also carries the parsed `value`, which is what the webview receives. */
export type ParsedFile = (Extract<TolerantResult, { ok: true }> & { value: unknown }) | Extract<TolerantResult, { ok: false }>;

/** Tolerant read of file text: unparseable JSON is a failure with the parser's reason. */
export function parseDiagram(text: string): ParsedFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, reason: `invalid JSON (${(error as Error).message})` };
  }
  const result = readDiagram(value);
  return result.ok ? { ...result, value } : result;
}
