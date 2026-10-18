// ACC-03: what the map should draw as uncertain, from evidence.json (ACC-01, ACC-02) and audit.json
// (ACC-05). Boxes with only declarations cited, or that the audit judged partial or contradicting,
// get a reason; arrows no import path backs are listed by index. Browser-safe and tolerant: the
// files are read as they are, and anything malformed is skipped.

export interface Uncertainty {
  /** Box id to the reason it is drawn dotted. */
  boxes: Record<string, string>;
  /** Indices of the arrows drawn as having no import evidence. */
  edges: number[];
}

/** The label an arrow without import evidence carries. */
export const NO_IMPORT_EVIDENCE = "no import evidence";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value: unknown, key: string): Record<string, unknown>[] => (isRecord(value) && Array.isArray(value[key]) ? (value[key] as unknown[]).filter(isRecord) : []);

export function uncertainty(evidence: unknown, audit: unknown): Uncertainty {
  const reasons = new Map<string, string[]>();
  const add = (id: unknown, reason: string): void => {
    if (typeof id === "string") reasons.set(id, [...(reasons.get(id) ?? []), reason]);
  };
  const edges = new Set<number>();
  for (const finding of list(evidence, "findings")) {
    if (finding["code"] === "DeclarationOnly") add(finding["component"], "Its citations only declare something.");
    const index = finding["code"] === "UnsupportedEdge" && typeof finding["pointer"] === "string" ? /^\/connections\/(\d+)$/.exec(finding["pointer"]) : null;
    if (index) edges.add(Number(index[1]));
  }
  for (const box of list(audit, "boxes")) {
    const reason = typeof box["reason"] === "string" ? box["reason"] : "";
    if (box["verdict"] === "partial") add(box["component"], `The audit found it partial: ${reason}`);
    if (box["verdict"] === "contradicts") add(box["component"], `The audit found the code contradicts it: ${reason}`);
  }
  return { boxes: Object.fromEntries([...reasons].map(([id, all]) => [id, all.join(" ")])), edges: [...edges].sort((a, b) => a - b) };
}
