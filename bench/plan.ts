// `npm run bench:plan -- --agent claude|codex --repo <id> --kind <kind> [--runs <n>] [--cap <usd>]`
// (CST-06): projects a series' tokens and cost from the estimate, and exits 1 above the cap.
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readCorpus } from "./lib/corpus";
import { parseOptions, USAGE } from "./lib/options";
import { planSeries, planText, TIER_SIZE } from "./lib/plan";

export function main(argv: readonly string[], env: NodeJS.ProcessEnv, write: (text: string) => void, repoRoot = resolve(".")): number {
  const options = parseOptions(argv, env);
  if (typeof options === "string") {
    write(`bench:plan: ${options}\n${USAGE.replace("npm run bench --", "npm run bench:plan --")}\n`);
    return 2;
  }
  const entry = readCorpus(join(repoRoot, "bench/corpus.json")).find((candidate) => candidate.id === options.repo);
  if (entry === undefined) {
    write(`bench:plan: no corpus entry "${options.repo}"\n`);
    return 2;
  }
  const questions = options.kind === "baseline" || options.kind === "assisted" ? entry.questions.length : 1;
  const plan = planSeries(options.agent, options.kind, options.runs, TIER_SIZE[entry.tier], options.cap, questions);
  write(planText(plan));
  return plan.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env, (text) => process.stdout.write(text));
}
