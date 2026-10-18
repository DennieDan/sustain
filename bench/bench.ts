// `npm run bench -- --agent claude|codex --repo <id> --kind <kind> [--runs <n>] [--cap <usd>] [--dry-run]`
// (CST-06): runs agents on bench/corpus.json in isolation and records each run in bench/results/.
// The series is planned first and refused above the cap; --dry-run prints each run's argv and
// environment and starts nothing.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { findOnPath } from "../src/model/which";
import { readCorpus } from "./lib/corpus";
import { AGENT_CONFIG, agentHomePreview, benchCache, cloneSource, mirrorPath } from "./lib/isolate";
import { benchArgs, benchEnv, benchPrompt, benchSkill, redactEnv } from "./lib/launch";
import { parseOptions, USAGE } from "./lib/options";
import { planSeries, planText, TIER_SIZE } from "./lib/plan";
import { benchRun, runRevision, SPAWN } from "./lib/run";

/** A run's folder name: when, what and which. */
export function runName(now: Date, repo: string, agent: string, kind: string, index: number): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `${stamp}-${repo}-${agent}-${kind}-${index + 1}`;
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv, write: (text: string) => void, repoRoot = resolve("."), now = new Date()): Promise<number> {
  const options = parseOptions(argv, env);
  if (typeof options === "string") {
    write(`bench: ${options}\n${USAGE}\n`);
    return 2;
  }
  const entry = readCorpus(join(repoRoot, "bench/corpus.json")).find((candidate) => candidate.id === options.repo);
  if (entry === undefined) {
    write(`bench: no corpus entry "${options.repo}"\n`);
    return 2;
  }
  try {
    benchSkill(options.kind);
  } catch (error) {
    write(`bench: ${(error as Error).message}\n`);
    return 2;
  }
  const questions = options.kind === "baseline" || options.kind === "assisted" ? entry.questions : [undefined];
  const plan = planSeries(options.agent, options.kind, options.runs, TIER_SIZE[entry.tier], options.cap, questions.length);
  write(planText(plan));
  if (!plan.ok) return 1;

  const binary = findOnPath(options.agent, env);
  const cache = benchCache(env);
  const results = join(repoRoot, "bench/results");
  const runs = Array.from({ length: options.runs }, (_, index) => questions.map((question, q) => ({ question, run: runName(now, entry.id, options.agent, options.kind, index) + (question === undefined ? "" : `-q${q + 1}`) }))).flat();

  if (options.dryRun) {
    const work = join(tmpdir(), "sustain-bench-<run>", "repo");
    const home = join(tmpdir(), "sustain-bench-<run>", "home");
    const skill = benchSkill(options.kind);
    const revision = runRevision(entry, options.kind);
    const homeEnv = agentHomePreview(home, options.agent);
    const steps = [
      entry.fixture !== undefined ? `copy ${entry.fixture} into a fresh repository at ${work}` : `clone ${cloneSource(entry, repoRoot)} into ${mirrorPath(cache, entry)}, then ${work} at ${revision}`,
      `remove ${AGENT_CONFIG.join(", ")} at any depth`,
      ...(entry.strip.length > 0 ? [`remove ${entry.strip.join(", ")}`] : []),
      skill === null ? `make ${home} with no skill` : `make ${home} holding only ${skill}, with hooks off`,
    ];
    const planned = runs.map(({ question, run }) => {
      const prompt = benchPrompt(options.agent, options.kind, { base: "<base run>", map: ".archify/<base run>/candidate.json", ...(question ? { question } : {}) });
      return { run, cwd: work, argv: [binary ?? `<${options.agent} not found on PATH>`, ...benchArgs(options.agent, options.kind, prompt, home)], env: redactEnv(options.agent, benchEnv(options.agent, home, homeEnv, env)), shell: SPAWN.shell, steps };
    });
    write(`${JSON.stringify({ plan, runs: planned }, null, 2)}\n`);
    return 0;
  }

  if (binary === undefined) {
    write(`bench: ${options.agent} was not found on PATH\n`);
    return 2;
  }
  for (const { question, run } of runs) {
    try {
      const result = await benchRun({ entry, agent: options.agent, kind: options.kind, binary, run, repoRoot, cache, results, env, ...(question ? { question } : {}) });
      write(`${run}: ${result.accepted ? "accepted" : "not accepted"}, ${result.tokens.toLocaleString("en-US")} tokens, ${result.costUsd === null ? "cost unknown" : `$${result.costUsd.toFixed(2)}`}, ${Math.round(result.wallMs / 1000)} s\n`);
    } catch (error) {
      write(`${run}: ${(error as Error).message}\n`);
      return 1;
    }
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), process.env, (text) => process.stdout.write(text));
}
