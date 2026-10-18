// ACC-04: reading and checking the ground truth, shared by `npm run eval` and `npm run
// eval:check-truth`. No command runs from here, so either command can import it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globToRegExp } from "../../src/model/refresh";
import type { Truth } from "../../src/model/score";
import type { CorpusEntry } from "../../bench/lib/corpus";

/** The ground truth of `repo`, or `null`. */
export function readTruth(repoRoot: string, repo: string): Truth | null {
  try {
    return JSON.parse(readFileSync(join(repoRoot, "eval/ground-truth", `${repo}.json`), "utf8")) as Truth;
  } catch {
    return null;
  }
}

/** Problems with `truth`'s own structure and with its revision against `entry`. */
export function structureProblems(truth: Truth, entry: CorpusEntry | undefined): string[] {
  const problems: string[] = [];
  const ids = truth.components.map((component) => component.id);
  for (const id of ids.filter((id, index) => ids.indexOf(id) !== index)) problems.push(`component "${id}" appears twice`);
  const known = new Set(ids);
  for (const edge of truth.edges) for (const end of [edge.from, edge.to]) if (!known.has(end)) problems.push(`an edge names unknown component "${end}"`);
  for (const group of truth.groups) for (const member of group.members) if (!known.has(member)) problems.push(`group "${group.id}" names unknown component "${member}"`);
  for (const component of truth.components) if (component.paths.length === 0) problems.push(`component "${component.id}" has no paths`);
  if (entry === undefined) problems.push(`bench/corpus.json has no entry "${truth.repo}"`);
  else if (entry.commit !== undefined && entry.commit !== truth.revision) problems.push(`revision ${truth.revision} is not the corpus's pinned commit ${entry.commit}`);
  return problems;
}

/** Globs of `truth` that match no file in `files`. */
export function unmatchedGlobs(truth: Truth, files: readonly string[]): string[] {
  return truth.components.flatMap((component) => component.paths.filter((glob) => !files.some((file) => globToRegExp(glob).test(file))).map((glob) => `${component.id}: ${glob} matches no file`));
}
