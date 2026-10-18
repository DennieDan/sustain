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
  sidecars?: { run?: unknown; fingerprints?: unknown; evidence?: unknown; tour?: unknown };
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

/** `owner/repo` of a github.com remote in HTTPS or SSH form, or `null`. */
export function githubSlug(origin: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(origin.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export interface MapPayloadInput {
  repo: string;
  commit: string;
  branch: string;
  run: string;
  map: unknown;
  record: { focus?: string; agent?: string; tokens?: unknown; costUsd?: number; skillVersion?: string } | null;
  sidecars: { run?: unknown; fingerprints?: unknown; evidence?: unknown; tour?: unknown };
  defaultBranch?: string;
}

/** The upload of a map with whichever sidecars exist (CLD-09). */
export function mapPayload(input: MapPayloadInput): Upload {
  const record = input.record ?? {};
  const meta: Upload["meta"] = { run: input.run };
  if (record.focus) meta.focus = record.focus;
  if (record.agent) meta.agent = record.agent;
  if (record.tokens) meta["tokens"] = record.tokens;
  if (record.costUsd !== undefined) meta["costUsd"] = record.costUsd;
  if (record.skillVersion) meta["skillVersion"] = record.skillVersion;
  if (input.defaultBranch) meta.defaultBranch = input.defaultBranch;
  const sidecars = Object.fromEntries(Object.entries(input.sidecars).filter(([, value]) => value !== undefined && value !== null));
  return { repo: input.repo, commit: input.commit, branch: input.branch, kind: "map", map: input.map, ...(Object.keys(sidecars).length > 0 ? { sidecars } : {}), meta };
}

/** The upload of a pull request's check with the map it compared against (CLD-09). */
export function checkPayload(input: { repo: string; commit: string; branch: string; pull: number; check: unknown; map: unknown; run: string; defaultBranch?: string }): Upload {
  return {
    repo: input.repo,
    commit: input.commit,
    branch: input.branch,
    kind: "check",
    check: input.check,
    map: input.map,
    meta: { pull: input.pull, run: input.run, ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}) },
  };
}
