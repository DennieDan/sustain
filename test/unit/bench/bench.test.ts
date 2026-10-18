// CST-06: the bench's dry run shows each run's argv and isolated environment and starts nothing; its
// parsers read recorded transcripts; bench:plan refuses a series above the cap.
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { main as bench } from "../../../bench/bench";
import { summarizeStream } from "../../../bench/lib/summary";
import { main as plan } from "../../../bench/plan";
import { claudeParser } from "../../../src/model/agentStream/claude";
import { codexParser } from "../../../src/model/agentStream/codex";
import { put, tempDir } from "../support/temp";
import { repoRoot } from "../support/sourceScan";

interface DryRun {
  plan: { ok: boolean };
  runs: { run: string; cwd: string; argv: string[]; env: Record<string, string>; shell: boolean; steps: string[] }[];
}

/** A PATH holding stub `claude` and `codex` executables, and the bench's other variables. */
function benchEnv(extra: NodeJS.ProcessEnv = {}): { env: NodeJS.ProcessEnv; bin: string; cache: string } {
  const bin = tempDir("sustain-bench-bin-");
  for (const name of ["claude", "codex"]) chmodSync(put(bin, name, "#!/bin/sh\nexit 0\n"), 0o755);
  const cache = join(tempDir("sustain-bench-cache-"), "cache");
  return { bin, cache, env: { PATH: bin, SUSTAIN_BENCH_CACHE: cache, ANTHROPIC_BASE_URL: "https://elsewhere.invalid", OPENAI_API_KEY: "sk-inherited", ...extra } };
}

async function dryRun(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; text: string; json: DryRun }> {
  let text = "";
  const code = await bench([...args, "--dry-run"], env, (chunk) => (text += chunk), repoRoot, new Date("2026-10-18T12:00:00Z"));
  return { code, text, json: JSON.parse(text.slice(text.indexOf("{"))) as DryRun };
}

test("CST-06 a dry run prints the argv and the whole environment of each run, isolated, and starts nothing", async () => {
  const { env, bin, cache } = benchEnv({ SUSTAIN_BENCH_ANTHROPIC_API_KEY: "sk-ant-test" });
  const { code, json } = await dryRun(["--agent", "claude", "--repo", "ab3", "--kind", "full"], env);
  expect(code).toBe(0);
  expect(json.runs).toHaveLength(1);
  const [run] = json.runs;
  const home = join(tmpdir(), "sustain-bench-<run>", "home");
  const skill = join(home, ".claude/skills/sustain-architecture/scripts");
  expect(run!.run).toBe("20261018-120000-ab3-claude-full-1");
  expect(run!.argv).toEqual([
    join(bin, "claude"),
    "-p",
    "/sustain-architecture",
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    "Read",
    "Grep",
    "Glob",
    `Bash(node ${skill}/repo-facts.mjs *)`,
    `Bash(node ${skill}/validate.mjs *)`,
    `Bash(node ${skill}/render-html.mjs *)`,
    "Edit(./.archify/**)",
  ]);
  expect(run!.env).toEqual({ PATH: bin, HOME: home, LANG: "C.UTF-8", CLAUDE_CONFIG_DIR: join(home, ".claude"), ANTHROPIC_API_KEY: "<redacted>" });
  expect(run!.shell).toBe(false);
  expect(run!.cwd).toBe(join(tmpdir(), "sustain-bench-<run>", "repo"));
  expect(run!.steps).toEqual([
    `clone https://github.com/se-edu/addressbook-level3.git into ${join(cache, "repos/ab3.git")}, then ${run!.cwd} at ecdc9bf0a169609a4758b8768f0f1e9795c7c1c0`,
    "remove .claude, .codex, .devin, .agents, .windsurf, AGENTS.md, CLAUDE.md at any depth",
    "remove docs/**, README.md",
    `make ${home} holding only sustain-architecture, with hooks off`,
  ]);
  expect(existsSync(cache)).toBe(false);
});

test("CST-06 Codex refreshes from the changed commit with its own home and key, and question kinds run read-only once per question", async () => {
  const { env, bin } = benchEnv();
  const refresh = (await dryRun(["--agent", "codex", "--repo", "zulip", "--kind", "refresh"], env)).json.runs[0]!;
  const home = join(tmpdir(), "sustain-bench-<run>", "home");
  expect(refresh.argv).toEqual([join(bin, "codex"), "exec", "--json", "--sandbox", "workspace-write", "$sustain-refresh --from <base run>"]);
  expect(refresh.env).toEqual({ PATH: bin, HOME: home, LANG: "C.UTF-8", CODEX_HOME: join(home, ".codex"), CODEX_API_KEY: "<missing>" });
  expect(refresh.steps[0]).toMatch(/at 4dacd6db094d5a8f5bacc4fe4e3f58da358a20b0$/);

  const baseline = (await dryRun(["--agent", "claude", "--repo", "ab3", "--kind", "baseline", "--runs", "2"], env)).json.runs;
  expect(baseline.map((run) => run.run)).toEqual(["20261018-120000-ab3-claude-baseline-1-q1", "20261018-120000-ab3-claude-baseline-1-q2", "20261018-120000-ab3-claude-baseline-2-q1", "20261018-120000-ab3-claude-baseline-2-q2"]);
  expect(baseline[0]!.argv.slice(baseline[0]!.argv.indexOf("--allowedTools"))).toEqual(["--allowedTools", "Read", "Grep", "Glob"]);
  expect(baseline[0]!.argv[2]).toContain("Question: Which component parses a user command");
  expect(baseline[0]!.steps.at(-1)).toBe(`make ${home} with no skill`);

  let text = "";
  expect(await bench(["--agent", "claude", "--repo", "ab3", "--kind", "audit", "--dry-run"], env, (chunk) => (text += chunk), repoRoot)).toBe(2);
  expect(text).toBe("bench: audit runs need ACC-05's audit pass, which is not built yet.\n");
});

test("CST-06 the parsers read recorded transcripts: tokens, cost, reads and validator runs", () => {
  const read = (name: string): string => readFileSync(join(repoRoot, "test/fixtures/streams", name), "utf8");
  expect(summarizeStream(read("claude-generate.jsonl"), claudeParser())).toMatchObject({
    usage: { input: 8300, output: 1190, cacheRead: 15000, cacheWrite: 500 },
    costUsd: 0.4123,
    reads: 1,
    searches: 1,
    writes: 1,
    validations: 1,
    ok: true,
  });
  expect(summarizeStream(read("codex-generate.jsonl"), codexParser())).toMatchObject({
    usage: { input: 12000, output: 1500, cacheRead: 9000, cacheWrite: 0 },
    costUsd: null,
    writes: 1,
    validations: 1,
  });
});

test("CST-06 bench:plan refuses a series above the cap, and the bench refuses to start it", async () => {
  let text = "";
  expect(plan(["--agent", "claude", "--repo", "zulip", "--kind", "full", "--runs", "50", "--cap", "5"], {}, (chunk) => (text += chunk), repoRoot)).toBe(1);
  expect(text).toMatch(/^50 runs: about [\d,]+–[\d,]+ tokens, \$[\d.]+–\$[\d.]+ at claude-opus-5-5 prices, above the \$5\.00 cap; raise --cap to run it\.\n$/);
  text = "";
  expect(plan(["--agent", "claude", "--repo", "ab3", "--kind", "full"], { SUSTAIN_BENCH_CAP: "100" }, (chunk) => (text += chunk), repoRoot)).toBe(0);
  expect(text).toContain("within the $100.00 cap");

  const { env } = benchEnv();
  text = "";
  expect(await bench(["--agent", "claude", "--repo", "zulip", "--kind", "full", "--runs", "50", "--cap", "5", "--dry-run"], env, (chunk) => (text += chunk), repoRoot)).toBe(1);
  expect(text).not.toContain("{");
});
