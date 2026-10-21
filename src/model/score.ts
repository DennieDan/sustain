// ACC-04: how close a map comes to a hand-written architecture. Boxes match truth components by
// containment: at least half of a box's cited paths fall inside a truth component's globs. Uncited
// boxes may match by label or alias. Browser-safe.
import { globToRegExp } from "./refresh";

export interface TruthComponent {
  id: string;
  label: string;
  aliases: string[];
  /** Globs of the files the component is made of. */
  paths: string[];
}

export interface Truth {
  repo: string;
  revision: string;
  /** The architecture document it was written from. */
  source: string;
  components: TruthComponent[];
  edges: { from: string; to: string }[];
  groups: { id: string; label: string; members: string[] }[];
}

export interface ScoredMap {
  components: readonly { id: string; label: string; sources?: readonly { path: string }[] }[];
  connections: readonly { from: string; to: string }[];
  boundaries?: readonly { label?: string; wraps: readonly string[] }[];
}

export interface Score {
  /** Map box to the truth component it matched, or `null`. */
  matches: Record<string, string | null>;
  /** Matched cited boxes over cited boxes. */
  precision: number;
  /** Truth components some box matched, over all of them. */
  recall: number;
  edges: { precision: number; recall: number };
  /** Map groups whose boxes belong to more than one truth group. */
  groupingErrors: string[];
  /** Cited paths inside the globs of their box's match, over all cited paths. */
  citationSupport: number;
}

const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : Number((part / whole).toFixed(4)));
const normal = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function score(map: ScoredMap, truth: Truth): Score {
  const globs = new Map(truth.components.map((component) => [component.id, component.paths.map(globToRegExp)]));
  const inside = (path: string, id: string): boolean => globs.get(id)!.some((glob) => glob.test(path));
  const matches: Record<string, string | null> = {};
  let cited = 0;
  let matchedCited = 0;
  let paths = 0;
  let supported = 0;
  for (const box of map.components) {
    const own = [...new Set((box.sources ?? []).map((source) => source.path))];
    let match: string | null = null;
    if (own.length > 0) {
      cited++;
      let best = 0;
      for (const component of truth.components) {
        const count = own.filter((path) => inside(path, component.id)).length;
        if (count * 2 >= own.length && count > best) [match, best] = [component.id, count];
      }
      if (match !== null) matchedCited++;
      paths += own.length;
      if (match !== null) supported += own.filter((path) => inside(path, match!)).length;
    } else {
      const label = normal(box.label);
      match = truth.components.find((component) => [component.label, ...component.aliases].some((name) => normal(name) === label))?.id ?? null;
    }
    matches[box.id] = match;
  }
  const found = new Set(Object.values(matches).filter((id): id is string => id !== null));
  const truthEdge = (a: string, b: string): boolean => truth.edges.some((edge) => (edge.from === a && edge.to === b) || (edge.from === b && edge.to === a));
  const mapped = map.connections.map((connection) => [matches[connection.from], matches[connection.to]] as const).filter((pair): pair is readonly [string, string] => pair[0] != null && pair[1] != null && pair[0] !== pair[1]);
  const coveredEdges = truth.edges.filter((edge) => mapped.some(([a, b]) => (a === edge.from && b === edge.to) || (a === edge.to && b === edge.from)));
  const groupOf = new Map(truth.groups.flatMap((group) => group.members.map((member) => [member, group.id] as const)));
  const groupingErrors = (map.boundaries ?? [])
    .map((boundary, index) => ({ name: boundary.label ?? `group ${index + 1}`, groups: new Set(boundary.wraps.map((id) => matches[id]).filter((id): id is string => id != null && groupOf.has(id)).map((id) => groupOf.get(id))) }))
    .filter((boundary) => boundary.groups.size > 1)
    .map((boundary) => boundary.name);
  return {
    matches,
    precision: ratio(matchedCited, cited),
    recall: ratio(found.size, truth.components.length),
    edges: { precision: ratio(mapped.filter(([a, b]) => truthEdge(a, b)).length, mapped.length), recall: ratio(coveredEdges.length, truth.edges.length) },
    groupingErrors,
    citationSupport: ratio(supported, paths),
  };
}
