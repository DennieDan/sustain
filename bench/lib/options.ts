// CST-06: the bench commands' options.
import type { EstimateAgent } from "../../src/model/estimate";
import type { BenchKind } from "../../src/model/fit";
import { DEFAULT_CAP_USD } from "./plan";

export const BENCH_KINDS: readonly BenchKind[] = ["full", "refresh", "audit", "baseline", "assisted"];
export const USAGE = "usage: npm run bench -- --agent claude|codex --repo <id> --kind full|refresh|audit|baseline|assisted [--runs <n>] [--cap <usd>] [--dry-run]";

export interface BenchOptions {
  agent: EstimateAgent;
  repo: string;
  kind: BenchKind;
  runs: number;
  cap: number;
  dryRun: boolean;
}

/** The options in `argv`, or what is wrong with them. */
export function parseOptions(argv: readonly string[], env: NodeJS.ProcessEnv): BenchOptions | string {
  const values = new Map<string, string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!;
    if (word === "--dry-run") dryRun = true;
    else if (["--agent", "--repo", "--kind", "--runs", "--cap"].includes(word) && argv[i + 1] !== undefined) values.set(word, argv[++i]!);
    else return `unknown or incomplete option ${word}`;
  }
  const agent = values.get("--agent");
  const kind = values.get("--kind") as BenchKind | undefined;
  const repo = values.get("--repo");
  const runs = Number(values.get("--runs") ?? "1");
  const cap = Number(values.get("--cap") ?? env["SUSTAIN_BENCH_CAP"] ?? DEFAULT_CAP_USD);
  if (agent !== "claude" && agent !== "codex") return "--agent must be claude or codex";
  if (repo === undefined) return "--repo is required";
  if (kind === undefined || !BENCH_KINDS.includes(kind)) return `--kind must be one of ${BENCH_KINDS.join(", ")}`;
  if (!Number.isInteger(runs) || runs < 1) return "--runs must be a whole number from 1";
  if (!Number.isFinite(cap) || cap < 0) return "--cap must be a number of US dollars";
  return { agent, repo, kind, runs, cap, dryRun };
}
