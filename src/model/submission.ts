// The validator's Submission profile (FR-VAL-02..04, FR-VAL-06 ordering), ported from the
// prototype's `archalign-model/src/submission.rs` and `archalign-agent/src/gate.rs`.
// File access (citations, step 4) is injected so this module stays free of Node APIs.
import { semanticChecks } from "./checks";
import { validateArchitecture } from "./schema";
import { isJsonObject, pointerToken, type ArchifyDoc, type Issue, type JsonObject, type Repository } from "./types";
import { findSecrets } from "./secrets";

const META_DROPS = ["viewBox", "views", "animation", "translations", "visual_preset", "engineering_profile"];
const COMPONENT_DROPS = ["pos", "size", "row", "col", "icon", "brand"];
const CONNECTION_DROPS = ["fromSide", "toSide", "route", "via", "labelAt", "labelDx", "labelDy", "labelSegment", "width"];
const BOUNDARY_DROPS = ["pad"];

export const REMOVED_FIELD_MESSAGE = "Removed app-owned field";

/** Values the validator owns and writes over whatever the agent supplied. */
export interface AppOwned {
  /** `meta.output`: `.archify/<run>/<slug>.html` (never written). */
  output: string;
  /** `meta.repository` from git facts, or `null` when unavailable. */
  repository: Repository | null;
}

function dropKeys(object: JsonObject, keys: readonly string[], prefix: string, removed: string[]): void {
  for (const key of keys) {
    if (Object.hasOwn(object, key)) {
      delete object[key];
      removed.push(`${prefix}/${pointerToken(key)}`);
    }
  }
}

function dropInArray(root: JsonObject, field: string, keys: readonly string[], removed: string[]): void {
  const items = root[field];
  if (!Array.isArray(items)) return;
  items.forEach((item, i) => {
    if (isJsonObject(item)) dropKeys(item, keys, `/${field}/${i}`, removed);
  });
}

/**
 * Step 1 (FR-VAL-02), in place: removes agent-authored geometry and presentation fields and
 * sets the app-owned values. Returns the pointers of every removed field. Non-object roots
 * are left for the schema step to reject.
 */
export function applyAppOwnedFields(value: unknown, app: AppOwned): string[] {
  const removed: string[] = [];
  if (!isJsonObject(value)) return removed;
  dropKeys(value, ["layout"], "", removed);
  if (isJsonObject(value["meta"])) dropKeys(value["meta"], META_DROPS, "/meta", removed);
  dropInArray(value, "components", COMPONENT_DROPS, removed);
  dropInArray(value, "connections", CONNECTION_DROPS, removed);
  dropInArray(value, "boundaries", BOUNDARY_DROPS, removed);

  // Re-insert every key after the two root constants so the candidate starts with them.
  const rest = Object.entries(value).filter(([key]) => key !== "schema_version" && key !== "diagram_type");
  for (const key of Object.keys(value)) delete value[key];
  Object.assign(value, { schema_version: 1, diagram_type: "architecture" }, Object.fromEntries(rest));
  if (!isJsonObject(value["meta"])) value["meta"] = {};
  const meta = value["meta"] as JsonObject;
  meta["locale"] = "en";
  meta["quality_profile"] = "showcase";
  meta["output"] = app.output;
  if (app.repository) meta["repository"] = { ...app.repository };
  else dropKeys(meta, ["repository"], "/meta", removed);
  return removed;
}

/**
 * `value` without the fields the validator owns, so it can start a new draft (FRS-05). The
 * validator sets them again on acceptance.
 */
export function stripAppOwned(value: unknown): unknown {
  const copy: unknown = structuredClone(value);
  if (!isJsonObject(copy)) return copy;
  const removed: string[] = [];
  dropKeys(copy, ["layout"], "", removed);
  if (isJsonObject(copy["meta"])) dropKeys(copy["meta"], [...META_DROPS, "locale", "quality_profile", "output", "repository"], "/meta", removed);
  dropInArray(copy, "components", COMPONENT_DROPS, removed);
  dropInArray(copy, "connections", CONNECTION_DROPS, removed);
  dropInArray(copy, "boundaries", BOUNDARY_DROPS, removed);
  return copy;
}

export interface SubmissionResult {
  /** Pointers of fields removed in step 1 (reported as warnings). */
  removed: string[];
  /** Errors of the first failing stage: schema alone, or semantic and citation errors together. */
  errors: Issue[];
}

/**
 * Runs steps 1–4 on a parsed draft, mutating it into the candidate. Schema errors stop
 * before steps 3–4; otherwise semantic checks, the secret scan (SAF-03) and `checkCitations` all run.
 */
export function checkSubmission(value: unknown, app: AppOwned, checkCitations: (doc: ArchifyDoc) => Issue[]): SubmissionResult {
  const removed = applyAppOwnedFields(value, app);
  const schemaErrors = validateArchitecture(value);
  if (schemaErrors.length > 0) return { removed, errors: schemaErrors };
  const doc = value as ArchifyDoc;
  return { removed, errors: [...semanticChecks(doc), ...findSecrets(doc), ...checkCitations(doc)] };
}
