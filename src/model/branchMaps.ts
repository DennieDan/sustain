// PRC-03: branch maps. The base map is the main map as the merge-base had it: its newest accepted
// map with an empty focus. A branch whose map is newer can be compared with it, and its map updated
// for exactly the candidates and stale boxes the review found.
import type { DeltaReport } from "./delta";
import { fileAt, filesAt } from "./git";
import { ARCHIFY_DIR, CANDIDATE_FILE, parseRunFolderName } from "./runFolder";
import { RUN_FILE } from "./runRecord";

/** Whether run folder `a` was made after `b`. */
export function newerRun(a: string, b: string): boolean {
  const left = parseRunFolderName(a);
  const right = parseRunFolderName(b);
  if (left === null || right === null) return false;
  return left.timestamp !== right.timestamp ? left.timestamp > right.timestamp : left.n > right.n;
}

/** The main map at `revision`: its newest accepted map with an empty focus, by run folder, or `null`. */
export function baseMap(root: string, revision: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const runs = new Set(
    filesAt(root, revision, ARCHIFY_DIR, env)
      .map((path) => path.split("/"))
      .filter((parts) => parts.length === 3 && parts[2] === CANDIDATE_FILE && parseRunFolderName(parts[1]!) !== null)
      .map((parts) => parts[1]!),
  );
  const unfocused = [...runs].filter((run) => {
    const record = fileAt(root, revision, `${ARCHIFY_DIR}/${run}/${RUN_FILE}`, env);
    if (record === null) return true;
    try {
      return ((JSON.parse(record.toString("utf8")) as { focus?: unknown }).focus ?? "") === "";
    } catch {
      return true;
    }
  });
  return unfocused.reduce<string | null>((newest, run) => (newest === null || newerRun(run, newest) ? run : newest), null);
}

/** The paths "Update map for this branch" limits the refresh to: each candidate's folder and each stale or gone box's cited files. */
export function branchPaths(report: Pick<DeltaReport, "candidates" | "stale" | "gone">, components: readonly { id: string; sources?: readonly { path: string }[] }[]): string[] {
  const boxes = new Set([...report.stale, ...report.gone].map((box) => box.id));
  const cited = components.filter((component) => boxes.has(component.id)).flatMap((component) => (component.sources ?? []).map((source) => source.path));
  return [...new Set([...report.candidates.map((candidate) => candidate.dir), ...cited])].sort();
}
