// Comparing two tolerant-parsed diagrams by ID (FR-CMP-03, ADR 0031). Browser-safe and pure:
// the webview runs it on the open diagram and its baseline.
import type { ViewBoundary, ViewComponent, ViewConnection, ViewDiagram } from "./tolerant";

/** Status of an element of the open diagram. `kept` only comes from {@link markKept}. */
export type ElementStatus = "added" | "changed" | "renamed" | "kept" | "unchanged";

/** Fields whose old and new text are shown (`null` = absent). */
export type TextField = "label" | "sublabel" | "tag" | "type" | "variant" | "kind";
/** Fields compared as sets; only their name is shown. */
export type SetField = "sources" | "boundary" | "members";

export type FieldChange = { field: TextField; before: string | null; after: string | null } | { field: SetField };

export interface ElementDiff {
  status: ElementStatus;
  /** Changed fields in a fixed order; empty unless `changed` or `renamed`. */
  fields: FieldChange[];
}

export interface DiagramDiff {
  /** Aligned with the open diagram's `components`. */
  components: ElementDiff[];
  /** Aligned with the open diagram's `connections`. */
  connections: ElementDiff[];
  /** Aligned with the open diagram's `boundaries`. */
  boundaries: ElementDiff[];
  /** Baseline elements with no counterpart, in baseline document order. */
  removed: { components: ViewComponent[]; connections: ViewConnection[]; boundaries: ViewBoundary[] };
  /** Over all three element kinds; `renamed` counts as changed, `kept` is not counted. */
  counts: { added: number; removed: number; changed: number };
}

const UNCHANGED: ElementDiff = { status: "unchanged", fields: [] };
const ADDED: ElementDiff = { status: "added", fields: [] };

/** Keys for `items` in document order; a repeated key after the first gets `#2`, `#3`… */
function uniqueKeys<T>(items: readonly T[], keyOf: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = keyOf(item);
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}#${n}`;
  });
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function textChange(fields: FieldChange[], field: TextField, before: string | undefined, after: string | undefined): void {
  if (before !== after) fields.push({ field, before: before ?? null, after: after ?? null });
}

function changedOrUnchanged(fields: FieldChange[]): ElementDiff {
  return fields.length === 0 ? UNCHANGED : { status: "changed", fields };
}

const connectionKey = (connection: ViewConnection): string => connection.id ?? `~${connection.from}→${connection.to}`;

/** Boundary key → member IDs containing each component, one map per side. */
function boundaryKeysByComponent(boundaries: readonly ViewBoundary[], keys: readonly string[], rename: (key: string) => string): Map<string, Set<string>> {
  const byComponent = new Map<string, Set<string>>();
  boundaries.forEach((boundary, i) => {
    const key = rename(keys[i]!);
    for (const member of boundary.wraps) {
      let set = byComponent.get(member);
      if (!set) byComponent.set(member, (set = new Set()));
      set.add(key);
    }
  });
  return byComponent;
}

/**
 * Per-element statuses of `current` against `baseline` (FR-CMP-03). Components match by `id`,
 * connections by `id` (else `~<from>→<to>`, repeats suffixed `#2`, `#3`…), boundaries by
 * `label`, with equal-member leftovers paired as renamed. Layout fields never count.
 */
export function diffDiagrams(baseline: ViewDiagram, current: ViewDiagram): DiagramDiff {
  // Boundaries first: their matching decides each component's boundary set.
  const baseBoundaryKeys = uniqueKeys(baseline.boundaries, (b) => b.label);
  const curBoundaryKeys = uniqueKeys(current.boundaries, (b) => b.label);
  const baseBoundaryIndex = new Map(baseBoundaryKeys.map((key, i) => [key, i]));
  /** Current boundary index → paired baseline index. */
  const pairedBase = new Map<number, number>();
  const usedBase = new Set<number>();
  curBoundaryKeys.forEach((key, i) => {
    const j = baseBoundaryIndex.get(key);
    if (j !== undefined) {
      pairedBase.set(i, j);
      usedBase.add(j);
    }
  });
  const renamed = new Set<number>();
  current.boundaries.forEach((boundary, i) => {
    if (pairedBase.has(i)) return;
    const members = new Set(boundary.wraps);
    const j = baseline.boundaries.findIndex((b, k) => !usedBase.has(k) && sameSet(new Set(b.wraps), members));
    if (j < 0) return;
    pairedBase.set(i, j);
    usedBase.add(j);
    renamed.add(i);
  });
  const baseToCurKey = new Map<string, string>();
  for (const [i, j] of pairedBase) baseToCurKey.set(baseBoundaryKeys[j]!, curBoundaryKeys[i]!);

  const boundaries = current.boundaries.map((boundary, i): ElementDiff => {
    const j = pairedBase.get(i);
    if (j === undefined) return ADDED;
    const before = baseline.boundaries[j]!;
    const fields: FieldChange[] = [];
    if (renamed.has(i)) fields.push({ field: "label", before: before.label, after: boundary.label });
    textChange(fields, "kind", before.kind, boundary.kind);
    if (!sameSet(new Set(before.wraps), new Set(boundary.wraps))) fields.push({ field: "members" });
    if (renamed.has(i)) return { status: "renamed", fields };
    return changedOrUnchanged(fields);
  });
  const removedBoundaries = baseline.boundaries.filter((_, j) => !usedBase.has(j));

  // Components. Unpaired baseline boundary keys get a prefix no current key can carry.
  const curBoundariesOf = boundaryKeysByComponent(current.boundaries, curBoundaryKeys, (key) => key);
  const baseBoundariesOf = boundaryKeysByComponent(baseline.boundaries, baseBoundaryKeys, (key) => baseToCurKey.get(key) ?? `\u0000${key}`);
  const empty: ReadonlySet<string> = new Set();
  const baseComponents = new Map(baseline.components.map((component) => [component.id, component]));
  const components = current.components.map((component): ElementDiff => {
    const before = baseComponents.get(component.id);
    if (!before) return ADDED;
    const fields: FieldChange[] = [];
    textChange(fields, "label", before.label, component.label);
    textChange(fields, "sublabel", before.sublabel, component.sublabel);
    textChange(fields, "tag", before.tag, component.tag);
    textChange(fields, "type", before.type, component.type);
    if (!sameSet(new Set(before.sources.map((s) => s.path)), new Set(component.sources.map((s) => s.path)))) fields.push({ field: "sources" });
    if (!sameSet(baseBoundariesOf.get(component.id) ?? empty, curBoundariesOf.get(component.id) ?? empty)) fields.push({ field: "boundary" });
    return changedOrUnchanged(fields);
  });
  const curIds = new Set(current.components.map((component) => component.id));
  const removedComponents = baseline.components.filter((component) => !curIds.has(component.id));

  // Connections: same key with other endpoints is one removal plus one addition.
  const baseConnectionKeys = uniqueKeys(baseline.connections, connectionKey);
  const baseConnectionIndex = new Map(baseConnectionKeys.map((key, j) => [key, j]));
  const matchedBase = new Set<number>();
  const connections = uniqueKeys(current.connections, connectionKey).map((key, i): ElementDiff => {
    const connection = current.connections[i]!;
    const j = baseConnectionIndex.get(key);
    const before = j === undefined ? undefined : baseline.connections[j]!;
    if (j === undefined || !before || before.from !== connection.from || before.to !== connection.to) return ADDED;
    matchedBase.add(j);
    const fields: FieldChange[] = [];
    textChange(fields, "label", before.label, connection.label);
    textChange(fields, "variant", before.variant, connection.variant);
    return changedOrUnchanged(fields);
  });
  const removedConnections = baseline.connections.filter((_, j) => !matchedBase.has(j));

  const all = [...components, ...connections, ...boundaries];
  return {
    components,
    connections,
    boundaries,
    removed: { components: removedComponents, connections: removedConnections, boundaries: removedBoundaries },
    counts: {
      added: all.filter((d) => d.status === "added").length,
      removed: removedComponents.length + removedConnections.length + removedBoundaries.length,
      changed: all.filter((d) => d.status === "changed" || d.status === "renamed").length,
    },
  };
}

/**
 * `diff` with every unchanged component of `current` whose ID is in `touched` marked `kept`
 * (FR-CMP-04): its cited code changed but the update left it as it was. Counts are unaffected.
 */
export function markKept(diff: DiagramDiff, current: ViewDiagram, touched: ReadonlySet<string>): DiagramDiff {
  return {
    ...diff,
    components: diff.components.map((d, i) => (d.status === "unchanged" && touched.has(current.components[i]!.id) ? { status: "kept", fields: [] } : d)),
  };
}
