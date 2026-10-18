// `npm run eval [-- --map <candidate.json> --truth <id>] [--results <dir>] [--format json|markdown]`
// (ACC-04): scores maps against eval/ground-truth/<id>.json. With --map it scores one map; otherwise
// every accepted full run in bench/results (CST-06) against its repository's truth.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDiagram } from "../src/model/tolerant";
import { score, type Score } from "../src/model/score";
import { readTruth } from "./lib/truth";

export interface Scored {
  name: string;
  repo: string;
  score: Score;
}

/** `file`'s map, read tolerantly with its groups. */
function readMap(file: string): Parameters<typeof score>[0] | null {
  try {
    const result = readDiagram(JSON.parse(readFileSync(file, "utf8")));
    if (!result.ok) return null;
    const { components, connections, boundaries } = result.diagram;
    return { components, connections, boundaries: boundaries.map((boundary) => ({ ...(boundary.label ? { label: boundary.label } : {}), wraps: boundary.wraps })) };
  } catch {
    return null;
  }
}

/** Every accepted full run in `results` with a truth for its repository. */
export function scoreResults(repoRoot: string, results: string): Scored[] {
  if (!existsSync(results)) return [];
  const scored: Scored[] = [];
  for (const run of readdirSync(results).sort()) {
    let record: { repo?: string; kind?: string; accepted?: boolean };
    try {
      record = JSON.parse(readFileSync(join(results, run, "result.json"), "utf8"));
    } catch {
      continue;
    }
    if (record.kind !== "full" || record.accepted !== true || record.repo === undefined) continue;
    const truth = readTruth(repoRoot, record.repo);
    const map = readMap(join(results, run, "candidate.json"));
    if (truth !== null && map !== null) scored.push({ name: run, repo: record.repo, score: score(map, truth) });
  }
  return scored;
}

export function scoreTable(rows: readonly Scored[]): string {
  const percent = (value: number): string => `${Math.round(value * 100)}%`;
  const lines = ["| Run | Repository | Precision | Recall | Arrow precision | Arrow recall | Grouping errors | Citation support |", "|---|---|---|---|---|---|---|---|"];
  for (const row of rows) {
    const { precision, recall, edges, groupingErrors, citationSupport } = row.score;
    lines.push(`| ${row.name} | ${row.repo} | ${percent(precision)} | ${percent(recall)} | ${percent(edges.precision)} | ${percent(edges.recall)} | ${groupingErrors.length} | ${percent(citationSupport)} |`);
  }
  return `${lines.join("\n")}\n`;
}

export function main(argv: readonly string[], write: (text: string) => void, repoRoot = resolve(".")): number {
  const option = (name: string): string | undefined => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const format = option("--format") ?? "markdown";
  let rows: Scored[];
  const mapFile = option("--map");
  if (mapFile !== undefined) {
    const repo = option("--truth");
    const truth = repo === undefined ? null : readTruth(repoRoot, repo);
    const map = readMap(resolve(mapFile));
    if (truth === null || map === null) {
      write("eval: --map needs a readable map and --truth the id of a file in eval/ground-truth.\n");
      return 2;
    }
    rows = [{ name: mapFile, repo: repo!, score: score(map, truth) }];
  } else {
    rows = scoreResults(repoRoot, resolve(option("--results") ?? join(repoRoot, "bench/results")));
    if (rows.length === 0) {
      write("eval: no accepted full runs with a ground truth in bench/results. Run npm run bench first, or pass --map and --truth.\n");
      return 1;
    }
  }
  write(format === "json" ? `${JSON.stringify(rows, null, 2)}\n` : scoreTable(rows));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), (text) => process.stdout.write(text));
}
