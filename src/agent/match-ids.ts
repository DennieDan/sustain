// `node .agents/skills/sustain-architecture/scripts/match-ids.mjs <draft> --previous <candidate>` (FR-UPD-09).
// Rewrites a regenerated draft in place so its elements carry the previous diagram's IDs. Bundled to a dependency-free
// ESM file.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { readJson } from "../model/jsonFile";
import { matchIds } from "../model/matchIds";
import { isRecord, stringifyDocument } from "../model/types";

function usageError(message: string): number {
  process.stderr.write(`match-ids.mjs: ${message}\n`);
  return 2;
}

/** The JSON in `path`, or the usage error that names `what` could not be read or parsed. */
function readInput(path: string, what: string): { value: unknown } | { error: string } {
  try {
    return { value: readJson(path) };
  } catch (error) {
    const message = (error as Error).message;
    return { error: error instanceof SyntaxError ? `${what} is not valid JSON: ${message}` : `cannot read ${what}: ${message}` };
  }
}

function main(args: string[]): number {
  if (args.length !== 3 || args[1] !== "--previous") {
    return usageError("usage: node match-ids.mjs <draft> --previous <candidate>");
  }
  const draftPath = resolve(process.cwd(), args[0]!);
  const previousPath = resolve(process.cwd(), args[2]!);
  const draft = readInput(draftPath, "draft");
  if ("error" in draft) return usageError(draft.error);
  const previous = readInput(previousPath, "previous candidate");
  if ("error" in previous) return usageError(previous.error);
  if (!isRecord(draft.value) || !Array.isArray(draft.value.components)) {
    return usageError("draft must be a JSON object with a components array");
  }
  if (!isRecord(previous.value)) return usageError("previous candidate must be a JSON object");

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
