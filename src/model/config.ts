// PRC-01: `sustain.config.json` at the repository root, committed with the code. Browser-safe;
// callers read the file.
import { readRules } from "./rules";
import { isRecord } from "./types";

export const CONFIG_FILE = "sustain.config.json";

/** What `--fail-on` and `check.failOn` accept. */
export const FAIL_ON = ["stale", "new-box", "new-arrow", "violation"] as const;
export type FailOn = (typeof FAIL_ON)[number];

export interface SustainConfig {
  /** The run folder of the map checks compare with. */
  map?: string;
  /** Globs of paths the delta report leaves out. */
  ignore?: string[];
  check?: { failOn?: FailOn[] };
  /** Architecture rules (ARC-01). */
  rules?: unknown[];
}

export type ConfigResult = { ok: true; config: SustainConfig } | { ok: false; errors: string[] };

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Checks a parsed config: known keys only, each of the right shape. */
export function readConfig(value: unknown): ConfigResult {
  if (!isRecord(value)) return { ok: false, errors: ["the config must be a JSON object"] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!["map", "ignore", "check", "rules"].includes(key)) errors.push(`unknown key "${key}"`);
  if (value["map"] !== undefined && (typeof value["map"] !== "string" || !/^[a-z0-9]+-[A-Za-z0-9._-]+$/.test(value["map"]))) errors.push('"map" must name a run folder in .archify/');
  if (value["ignore"] !== undefined && !strings(value["ignore"])) errors.push('"ignore" must be a list of globs');
  if (value["rules"] !== undefined) errors.push(...readRules(value["rules"]).errors);
  const check = value["check"];
  if (check !== undefined) {
    if (!isRecord(check)) errors.push('"check" must be an object');
    else {
      for (const key of Object.keys(check)) if (key !== "failOn") errors.push(`unknown key "check.${key}"`);
      const failOn = check["failOn"];
      if (failOn !== undefined && !(strings(failOn) && failOn.every((entry) => (FAIL_ON as readonly string[]).includes(entry)))) {
        errors.push(`"check.failOn" may list only ${FAIL_ON.join(", ")}`);
      }
    }
  }
  return errors.length === 0 ? { ok: true, config: value as SustainConfig } : { ok: false, errors };
}

/** `config` with `dir` added to `ignore` as `dir/**`, for the Ignore action (PRC-02). */
export function withIgnored(config: SustainConfig, dir: string): SustainConfig {
  const glob = dir === "" ? "**" : `${dir}/**`;
  const ignore = config.ignore ?? [];
  return ignore.includes(glob) ? config : { ...config, ignore: [...ignore, glob] };
}
