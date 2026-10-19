// `node .agents/skills/sustain-architecture/scripts/match-ids.mjs <draft> --previous <candidate>` (FR-UPD-09).
// Rewrites a regenerated draft in place so its elements carry the previous diagram's IDs. Bundled to a dependency-free
// ESM file.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchIds } from "../model/matchIds";
import { isJsonObject, stringifyDocument } from "../model/types";

function usageError(message: string): number {
  process.stderr.write(`match-ids.mjs: ${message}\n`);
  return 2;
}

function readJson(path: string, what: string): { value: unknown } | { error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    return { error: `cannot read ${what}: ${(error as Error).message}` };
  }
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: `${what} is not valid JSON: ${(error as Error).message}` };
  }
}

function main(args: string[]): number {
  if (args.length !== 3 || args[1] !== "--previous") {
    return usageError("usage: node match-ids.mjs <draft> --previous <candidate>");
  }
  const draftPath = resolve(process.cwd(), args[0]!);
  const previousPath = resolve(process.cwd(), args[2]!);
  const draft = readJson(draftPath, "draft");
  if ("error" in draft) return usageError(draft.error);
  const previous = readJson(previousPath, "previous candidate");
  if ("error" in previous) return usageError(previous.error);
  if (!isJsonObject(draft.value) || !Array.isArray(draft.value.components)) {
    return usageError("draft must be a JSON object with a components array");
  }
  if (!isJsonObject(previous.value)) return usageError("previous candidate must be a JSON object");

  const { diagram, componentMap, connectionMap, renamed } = matchIds(previous.value, draft.value);
  try {
    writeFileSync(draftPath, stringifyDocument(diagram));
  } catch (error) {
    return usageError(`cannot write draft: ${(error as Error).message}`);
  }
  process.stdout.write(`${JSON.stringify({ componentMap, connectionMap, renamed }, null, 2)}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
