// ACC-05: audit.json, the audit skill's verdict on each box and the evidence it found for each arrow,
// and the check audit-record.mjs runs on the skill's draft before writing it. Browser-safe.
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import auditSchema from "./schemas/audit.schema.json";
import type { Issue } from "./types";

export const AUDIT_FILE = "audit.json";
export const AUDIT_DRAFT_FILE = "audit-draft.json";

export type Verdict = "supports" | "partial" | "contradicts";

export interface AuditBox {
  component: string;
  verdict: Verdict;
  /** At most 200 characters. */
  reason: string;
}

export interface AuditArrow {
  /** Index into the map's connections. */
  connection: number;
  from: string;
  to: string;
  /** Up to 3 ranges where the two boxes work together; empty when none was found. */
  evidence: { path: string; line?: number; end_line?: number }[];
}

export interface AuditDraft {
  boxes: AuditBox[];
  arrows: AuditArrow[];
}

export interface Audit extends AuditDraft {
  schema: 1;
  createdAt: string;
}

let compiled: ValidateFunction | undefined;

function toIssue(error: ErrorObject): Issue {
  const extra = error.keyword === "additionalProperties" ? ` \`${(error.params as { additionalProperty: string }).additionalProperty}\`` : "";
  return { code: "Schema", pointer: error.instancePath, message: `${error.message ?? "is invalid"}${extra}` };
}

/** Issues with `value` as an audit of `map`: the shape, then one verdict per box and one entry per arrow. */
export function checkAuditDraft(value: unknown, map: { components: readonly { id: string }[]; connections: readonly { from: string; to: string }[] }): Issue[] {
  compiled ??= new Ajv2020({ allErrors: true, strict: false }).compile(auditSchema);
  if (!compiled(value)) return (compiled.errors ?? []).map(toIssue);
  const draft = value as AuditDraft;
  const issues: Issue[] = [];
  const ids = new Set(map.components.map((component) => component.id));
  const seen = new Set<string>();
  draft.boxes.forEach((box, index) => {
    if (!ids.has(box.component)) issues.push({ code: "UnknownReference", pointer: `/boxes/${index}/component`, message: `the map has no box "${box.component}"` });
    else if (seen.has(box.component)) issues.push({ code: "DuplicateId", pointer: `/boxes/${index}`, message: `box "${box.component}" has a verdict already` });
    seen.add(box.component);
  });
  for (const component of map.components) {
    if (!seen.has(component.id)) issues.push({ code: "MissingEntry", pointer: "/boxes", message: `box "${component.id}" has no verdict` });
  }
  const covered = new Set<number>();
  draft.arrows.forEach((arrow, index) => {
    const connection = map.connections[arrow.connection];
    if (connection === undefined) issues.push({ code: "UnknownReference", pointer: `/arrows/${index}/connection`, message: `the map has no arrow ${arrow.connection}` });
    else if (connection.from !== arrow.from || connection.to !== arrow.to) issues.push({ code: "UnknownReference", pointer: `/arrows/${index}`, message: `arrow ${arrow.connection} runs from "${connection.from}" to "${connection.to}"` });
    else if (covered.has(arrow.connection)) issues.push({ code: "DuplicateId", pointer: `/arrows/${index}`, message: `arrow ${arrow.connection} has an entry already` });
    covered.add(arrow.connection);
  });
  map.connections.forEach((connection, index) => {
    if (!covered.has(index)) issues.push({ code: "MissingEntry", pointer: "/arrows", message: `arrow ${index}, from "${connection.from}" to "${connection.to}", has no entry` });
  });
  return issues;
}
