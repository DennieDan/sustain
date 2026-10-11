// JSON Schema validation against the vendored Archify schemas (FR-MOD-02, ADR 0013).
//
// Both schemas are bundled; the architecture schema's `common.schema.json#/$defs/...`
// references resolve by `$id` against the in-memory common schema, so nothing is fetched.
import Ajv2020 from "ajv/dist/2020";
import type { ErrorObject, ValidateFunction } from "ajv";
import architectureSchema from "./schemas/architecture.schema.json";
import commonSchema from "./schemas/common.schema.json";
import { pointerToken, type Issue } from "./types";

let compiled: ValidateFunction | undefined;

function validator(): ValidateFunction {
  if (!compiled) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema(commonSchema);
    compiled = ajv.compile(architectureSchema);
  }
  return compiled;
}

function toIssue(error: ErrorObject): Issue {
  const params = error.params as Record<string, unknown>;
  if (error.keyword === "additionalProperties" && typeof params["additionalProperty"] === "string") {
    const extra = params["additionalProperty"];
    return {
      code: "Schema",
      pointer: `${error.instancePath}/${pointerToken(extra)}`,
      message: `unknown field \`${extra}\` (no additional properties are allowed here)`,
    };
  }
  let message = error.message ?? `fails schema keyword \`${error.keyword}\``;
  if (error.keyword === "enum" && Array.isArray(params["allowedValues"])) {
    message += `: ${params["allowedValues"].map((value) => JSON.stringify(value)).join(", ")}`;
  }
  return { code: "Schema", pointer: error.instancePath, message };
}

/** Every schema violation of `value`, in Ajv's report order. Empty when valid. */
export function validateArchitecture(value: unknown): Issue[] {
  const validate = validator();
  return validate(value) ? [] : (validate.errors ?? []).map(toIssue);
}
