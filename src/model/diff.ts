// FRS-07: what changed between two maps. Boxes match by id, or, when an id changed, by citing mostly
// the same files; arrows match by their two ends after that. Browser-safe.

interface Box {
  id: string;
  label: string;
  sources?: readonly { path: string }[];
}

interface Arrow {
  from: string;
  to: string;
  label?: string;
}

export interface MapDiff {
  boxes: {
    /** Ids in the newer map. */
    added: string[];
    /** Boxes of the older map that are gone. */
    removed: { id: string; label: string }[];
    /** The newer id, with the older id and label it had. */
    relabelled: { id: string; was: string; label: string }[];
  };
  arrows: {
    /** Indices of the newer map's connections. */
    added: number[];
    /** The older map's arrows that are gone, with their ends as the newer map names them where it can. */
    removed: { from: string; to: string; label?: string }[];
    /** Indices of the newer map's connections whose label changed, with the older label. */
    relabelled: { index: number; was: string }[];
  };
}

/** At least half of the two boxes' cited files in common. */
const SAME_FILES = 0.5;

function overlap(a: Box, b: Box): number {
  const left = new Set((a.sources ?? []).map((source) => source.path));
  const right = new Set((b.sources ?? []).map((source) => source.path));
  const shared = [...left].filter((path) => right.has(path)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : shared / union;
}

/** How `after` differs from `before`. */
export function diffMaps(before: { components: readonly Box[]; connections: readonly Arrow[] }, after: { components: readonly Box[]; connections: readonly Arrow[] }): MapDiff {
  const newIds = new Set(after.components.map((box) => box.id));
  const oldIds = new Set(before.components.map((box) => box.id));
  // Older id to newer id: the same id, or a box citing mostly the same files.
  const renamed = new Map<string, string>();
  for (const box of before.components) if (newIds.has(box.id)) renamed.set(box.id, box.id);
  const unmatchedNew = after.components.filter((box) => !oldIds.has(box.id));
  for (const box of before.components.filter((entry) => !newIds.has(entry.id))) {
    let best: { id: string; score: number } | null = null;
    for (const candidate of unmatchedNew) {
      const score = overlap(box, candidate);
      if (score >= SAME_FILES && (best === null || score > best.score) && ![...renamed.values()].includes(candidate.id)) best = { id: candidate.id, score };
    }
    if (best !== null) renamed.set(box.id, best.id);
  }
  const matchedNew = new Set(renamed.values());
  const newLabel = new Map(after.components.map((box) => [box.id, box.label]));
  const relabelled = before.components
    .filter((box) => renamed.has(box.id) && (renamed.get(box.id) !== box.id || newLabel.get(box.id) !== box.label))
    .map((box) => ({ id: renamed.get(box.id)!, was: box.id, label: box.label }));

  const key = (from: string, to: string): string => `${from}\0${to}`;
  const oldArrows = new Map(before.connections.map((arrow) => [key(renamed.get(arrow.from) ?? arrow.from, renamed.get(arrow.to) ?? arrow.to), arrow]));
  const newKeys = new Set(after.connections.map((arrow) => key(arrow.from, arrow.to)));
  return {
    boxes: {
      added: after.components.filter((box) => !matchedNew.has(box.id)).map((box) => box.id),
      removed: before.components.filter((box) => !renamed.has(box.id)).map((box) => ({ id: box.id, label: box.label })),
      relabelled,
    },
    arrows: {
      added: after.connections.flatMap((arrow, index) => (oldArrows.has(key(arrow.from, arrow.to)) ? [] : [index])),
      removed: [...oldArrows].filter(([arrowKey]) => !newKeys.has(arrowKey)).map(([arrowKey, arrow]) => {
        const [from, to] = arrowKey.split("\0") as [string, string];
        return { from, to, ...(arrow.label ? { label: arrow.label } : {}) };
      }),
      relabelled: after.connections.flatMap((arrow, index) => {
        const was = oldArrows.get(key(arrow.from, arrow.to));
        return was !== undefined && (was.label ?? "") !== (arrow.label ?? "") ? [{ index, was: was.label ?? "" }] : [];
      }),
    },
  };
}

/** "2 boxes added · 1 removed · 1 relabelled · 3 arrows added · 1 removed". */
export function diffSummary(diff: MapDiff): string {
  const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
  return [
    `${plural(diff.boxes.added.length, "box", "boxes")} added`,
    `${diff.boxes.removed.length} removed`,
    `${diff.boxes.relabelled.length} relabelled`,
    `${plural(diff.arrows.added.length, "arrow", "arrows")} added`,
    `${diff.arrows.removed.length} removed`,
  ].join(" · ");
}
