// Semantic checks JSON Schema cannot express (FR-VAL-04), ported from the prototype's
// `archalign-model/src/checks.rs` (Submission profile: every rule is an error). Browser-safe.
import type { ArchifyDoc, Issue } from "./types";

export type BoundaryRelation = "disjoint" | "equal" | "contains" | "containedBy" | "partialOverlap";

/** How member set `a` relates to member set `b`. */
export function boundaryRelation(a: ReadonlySet<string>, b: ReadonlySet<string>): BoundaryRelation {
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  if (shared === 0) return "disjoint";
  if (shared === a.size && shared === b.size) return "equal";
  if (shared === b.size) return "contains";
  if (shared === a.size) return "containedBy";
  return "partialOverlap";
}

/** Duplicate IDs, unresolved references, components without sources, overlapping boundaries. */
export function semanticChecks(doc: ArchifyDoc): Issue[] {
  const issues: Issue[] = [];

  const firstComponent = new Map<string, number>();
  doc.components.forEach((component, i) => {
    const first = firstComponent.get(component.id);
    if (first === undefined) firstComponent.set(component.id, i);
    else {
      issues.push({
        code: "DuplicateId",
        pointer: `/components/${i}/id`,
        message: `Duplicate component id \`${component.id}\` (first used at /components/${first})`,
      });
    }
  });

  const firstConnection = new Map<string, number>();
  (doc.connections ?? []).forEach((connection, i) => {
    if (connection.id !== undefined) {
      const first = firstConnection.get(connection.id);
      if (first === undefined) firstConnection.set(connection.id, i);
      else {
        issues.push({
          code: "DuplicateId",
          pointer: `/connections/${i}/id`,
          message: `Duplicate connection id \`${connection.id}\` (first used at /connections/${first})`,
        });
      }
    }
    for (const field of ["from", "to"] as const) {
      if (!firstComponent.has(connection[field])) {
        issues.push({
          code: "UnknownReference",
          pointer: `/connections/${i}/${field}`,
          message: `Connection \`${field}\` names unknown component \`${connection[field]}\``,
        });
      }
    }
  });

  const boundaries = doc.boundaries ?? [];
  boundaries.forEach((boundary, i) => {
    boundary.wraps.forEach((id, j) => {
      if (!firstComponent.has(id)) {
        issues.push({
          code: "UnknownReference",
          pointer: `/boundaries/${i}/wraps/${j}`,
          message: `Boundary \`${boundary.label}\` wraps unknown component \`${id}\``,
        });
      }
    });
  });

  doc.components.forEach((component, i) => {
    if (component.sources === undefined || component.sources.length === 0) {
      issues.push({
        code: "MissingSources",
        pointer: `/components/${i}`,
        message: `Component \`${component.id}\` has no sources; cite 1–3 files that implement it`,
      });
    }
  });

  const sets = boundaries.map((boundary) => new Set(boundary.wraps));
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const relation = boundaryRelation(sets[i]!, sets[j]!);
      const [first, second] = [boundaries[i]!.label, boundaries[j]!.label];
      if (relation === "partialOverlap") {
        issues.push({
          code: "BoundaryOverlap",
          pointer: `/boundaries/${j}`,
          message: `Boundaries \`${first}\` (/boundaries/${i}) and \`${second}\` share components but neither contains the other`,
        });
      } else if (relation === "equal") {
        issues.push({
          code: "BoundaryOverlap",
          pointer: `/boundaries/${j}`,
          message: `Boundaries \`${first}\` (/boundaries/${i}) and \`${second}\` wrap the same components; nesting must be strict`,
        });
      }
    }
  }
  return issues;
}
