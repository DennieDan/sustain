// CLD-02 and CLD-09: what Sustain Cloud accepts, checked the same way by the server and by
// `sustain.mjs publish` before it sends. An upload is an Archify map with its sidecars, or a
// check result, plus metadata; no object may carry extra properties, the map must pass the
// vendored Archify schemas, and nothing may look like a secret (SAF-03).
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import { validateArchitecture } from "./schema";
import uploadSchema from "./schemas/upload.schema.json";
import { findSecrets } from "./secrets";
import type { Issue } from "./types";

/** The largest body the cloud reads. */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

export const UPLOAD_SCHEMA: unknown = uploadSchema;

export interface Upload {
  repo: string;
  commit: string;
  branch: string;
  kind: "map" | "check";
  map?: unknown;
  sidecars?: { run?: unknown; fingerprints?: unknown; evidence?: unknown };
  check?: unknown;
  meta: { run?: string; focus?: string; agent?: string; pull?: number; defaultBranch?: string; [key: string]: unknown };
}

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  compiled ??= new Ajv2020({ allErrors: true, strict: false }).compile(uploadSchema);
  return compiled;
}

function toIssue(error: ErrorObject): Issue {
  const extra = (error.params as Record<string, unknown>)["additionalProperty"];
  if (error.keyword === "additionalProperties" && typeof extra === "string") {
    return { code: "Schema", pointer: `${error.instancePath}/${extra}`, message: `unknown field \`${extra}\`; uploads carry maps, sidecars, checks and metadata only` };
  }
  return { code: "Schema", pointer: error.instancePath, message: error.message ?? error.keyword };
}

/** Every reason `value` is not an acceptable upload; empty when it is. */
export function checkUpload(value: unknown): Issue[] {
  const validate = validator();
  if (!validate(value)) return (validate.errors ?? []).map(toIssue);
  const upload = value as unknown as Upload;
  const mapIssues = upload.map === undefined ? [] : validateArchitecture(upload.map).map((issue) => ({ ...issue, pointer: `/map${issue.pointer}` }));
  return [...mapIssues, ...findSecrets(value)];
}
