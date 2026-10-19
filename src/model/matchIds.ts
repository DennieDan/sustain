// Post-hoc ID matcher for regenerated drafts (FR-UPD-09). Gives the elements of an independently drawn draft the IDs of
// the previous diagram's elements they correspond to, by Jaccard similarity of cited file sets. Pure: no Node imports.
import { isJsonObject, type JsonObject } from "./types";

/** Minimum Jaccard similarity of cited file sets for a draft component to inherit a previous component's id. */
export const MATCH_THRESHOLD = 0.3;

/** A draft with previous IDs reassigned, plus what changed (draft id → final id). */
export interface MatchResult {
  diagram: JsonObject;
  componentMap: Record<string, string>;
  connectionMap: Record<string, string>;
  renamed: Record<string, string>;
}

interface Keyed {
  id: string;
  label: unknown;
  files: Set<string>;
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function idOf(value: JsonObject): string | undefined {
  return typeof value.id === "string" ? value.id : undefined;
}

function keyed(components: JsonObject[]): Keyed[] {
  const out: Keyed[] = [];
  for (const c of components) {
    const id = idOf(c);
    if (id === undefined) continue;
    const files = new Set<string>();
    for (const source of objects(c.sources)) if (typeof source.path === "string") files.add(source.path);
    out.push({ id, label: c.label, files });
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const value of a) if (b.has(value)) inter++;
  return inter / (a.size + b.size - inter);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One-to-one assignment, highest similarity first; ties by equal label, previous id, draft id. */
function greedyMatch(previous: Keyed[], draft: Keyed[], threshold: number): { previous: string; draft: string }[] {
  const candidates: { p: Keyed; d: Keyed; similarity: number }[] = [];
  for (const p of previous) {
    for (const d of draft) {
      const similarity = jaccard(p.files, d.files);
      if (similarity > 0 && similarity >= threshold) candidates.push({ p, d, similarity });
    }
  }
  candidates.sort((x, y) =>
    y.similarity - x.similarity
    || Number(y.p.label === y.d.label) - Number(x.p.label === x.d.label)
    || cmp(x.p.id, y.p.id)
    || cmp(x.d.id, y.d.id));
  const usedPrevious = new Set<string>();
  const usedDraft = new Set<string>();
  const out: { previous: string; draft: string }[] = [];
  for (const { p, d } of candidates) {
    if (usedPrevious.has(p.id) || usedDraft.has(d.id)) continue;
    usedPrevious.add(p.id);
    usedDraft.add(d.id);
    out.push({ previous: p.id, draft: d.id });
  }
  return out;
}

function freshId(id: string, avoid: Iterable<string>[]): string {
  const taken = new Set<string>();
  for (const set of avoid) for (const value of set) taken.add(value);
  for (let n = 1; ; n++) {
    const candidate = `${id}-n${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Reassigns `previous` IDs to the matching elements of `draft`. `previous` may be any shape (legacy files are
 * tolerated, malformed entries skipped); `draft` must be an object with a `components` array. Every other draft field
 * is preserved, as is the key order of the draft root.
 */
export function matchIds(previous: unknown, draft: JsonObject, threshold = MATCH_THRESHOLD): MatchResult {
  if (!(threshold > 0 && threshold <= 1)) throw new Error(`invalid match threshold ${threshold}`);
  if (!Array.isArray(draft.components)) throw new Error("draft has no components array");
  const prev = isJsonObject(previous) ? previous : {};
  const prevComponents = keyed(objects(prev.components));
  const draftComponents = objects(draft.components);

  const componentMap = new Map<string, string>();
  for (const m of greedyMatch(prevComponents, keyed(draftComponents), threshold)) componentMap.set(m.draft, m.previous);
  const previousIds = new Set(prevComponents.map((c) => c.id));
  const assigned = new Set(componentMap.values());
  const renamed: Record<string, string> = {};
  const taken = new Set<string>(assigned);
  for (const c of draftComponents) {
    const id = idOf(c);
    if (id !== undefined && !componentMap.has(id)) taken.add(id);
  }
  // An unmatched draft component that reuses a previous id is a new element: it gets a fresh id.
  for (const c of draftComponents) {
    const id = idOf(c);
    if (id === undefined || componentMap.has(id)) continue;
    if (!previousIds.has(id)) {
      componentMap.set(id, id);
      continue;
    }
    const fresh = freshId(id, [taken, previousIds]);
    taken.add(fresh);
    renamed[id] = fresh;
    componentMap.set(id, fresh);
  }
  const mapComponent = (id: unknown): unknown => (typeof id === "string" ? componentMap.get(id) ?? id : id);

  // A draft connection keeps a previous id when both endpoints matched and the mapped pair equals that connection's.
  const previousByEndpoints = new Map<string, string[]>();
  const previousConnectionIds = new Set<string>();
  for (const c of objects(prev.connections)) {
    const id = idOf(c);
    if (id === undefined || typeof c.from !== "string" || typeof c.to !== "string") continue;
    previousConnectionIds.add(id);
    const key = `${c.from}\u0000${c.to}`;
    previousByEndpoints.set(key, [...(previousByEndpoints.get(key) ?? []), id]);
  }
  const draftConnectionIds = objects(draft.connections).map(idOf).filter((id): id is string => id !== undefined);
  const usedConnectionIds = new Set<string>();
  const connectionMap: Record<string, string> = {};
  const mapConnection = (c: unknown): unknown => {
    if (!isJsonObject(c)) return c;
    const from = mapComponent(c.from);
    const to = mapComponent(c.to);
    const bothMatched = typeof from === "string" && typeof to === "string" && assigned.has(from) && assigned.has(to);
    const candidates = bothMatched
      ? (previousByEndpoints.get(`${from}\u0000${to}`) ?? []).filter((id) => !usedConnectionIds.has(id))
      : [];
    const original = idOf(c);
    let id = original;
    if (candidates.length > 0) id = candidates[0];
    else if (id !== undefined && previousConnectionIds.has(id)) {
      id = freshId(id, [usedConnectionIds, previousConnectionIds, draftConnectionIds]);
    }
    if (id !== undefined) {
      usedConnectionIds.add(id);
      if (original !== undefined && id !== original) connectionMap[original] = id;
    }
    return { ...c, ...(id !== undefined ? { id } : {}), from, to };
  };

  const diagram: JsonObject = { ...draft };
  diagram.components = draft.components.map((c) => (isJsonObject(c) && idOf(c) !== undefined ? { ...c, id: mapComponent(c.id) } : c));
  if (Array.isArray(draft.connections)) diagram.connections = draft.connections.map(mapConnection);
  if (Array.isArray(draft.boundaries)) {
    diagram.boundaries = draft.boundaries.map((b) =>
      isJsonObject(b) && Array.isArray(b.wraps) ? { ...b, wraps: b.wraps.map(mapComponent) } : b);
  }
  return { diagram, componentMap: Object.fromEntries(componentMap), connectionMap, renamed };
}
