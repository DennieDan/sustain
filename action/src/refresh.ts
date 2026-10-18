// PRC-05: the opt-in map update in CI. With `refresh: claude` or `refresh: codex` and its API key, and
// new box candidates or stale boxes to cover, the Action runs the refresh skill headless in a fresh home
// holding only that skill, then commits the new run folder to the pull request's branch. A fork's pull
// request is never updated.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { headlessArgs, SKILL_SCRIPTS, skillPrompt } from "../../src/extension/agents";
import { agentHome, agentHomePreview } from "../../src/model/agentHome";
import { claudeParser } from "../../src/model/agentStream/claude";
import { codexParser } from "../../src/model/agentStream/codex";
import { summarizeStream } from "../../src/model/agentStream/summary";
import { branchPaths } from "../../src/model/branchMaps";
import type { DeltaReport } from "../../src/model/delta";
import { diffMaps, diffSummary } from "../../src/model/diff";
import { refreshArgs } from "../../src/model/refresh";
import { ARCHIFY_DIR, CANDIDATE_FILE } from "../../src/model/runFolder";
import { newRunSince, runFolderNames } from "../../src/model/runRecord";
import { readDiagram } from "../../src/model/tolerant";
import { findOnPath } from "../../src/model/which";

export type RefreshAgent = "claude" | "codex";
/** The secret each agent's update needs, as the workflow passes it in. */
export const REFRESH_KEYS: Record<RefreshAgent, string> = { claude: "ANTHROPIC_API_KEY", codex: "OPENAI_API_KEY" };
/** Longest the agent may run. */
export const REFRESH_TIMEOUT_MS = 30 * 60_000;

export type RefreshDecision = { run: true; agent: RefreshAgent; paths: string[] } | { run: false; reason: string | null };

interface PullEvent {
  pull_request?: { head?: { sha?: unknown; repo?: { full_name?: unknown; fork?: unknown } | null } };
  repository?: { full_name?: unknown };
}

/** Whether to update the map; a `null` reason means the update was not asked for. */
export function refreshDecision(input: {
  refresh: string;
  env: NodeJS.ProcessEnv;
  event: unknown;
  report: Pick<DeltaReport, "candidates" | "stale" | "gone">;
  components: readonly { id: string; sources?: readonly { path: string }[] }[];
  /** The checked-out commit. */
  head: string | null;
}): RefreshDecision {
  if (input.refresh === "") return { run: false, reason: null };
  if (input.refresh !== "claude" && input.refresh !== "codex") return { run: false, reason: "refresh takes claude or codex." };
  const event = input.event as PullEvent | null;
  const headRepo = event?.pull_request?.head?.repo;
  if (headRepo === null || headRepo === undefined || headRepo.fork === true || headRepo.full_name !== event?.repository?.full_name) {
    return { run: false, reason: "The map is never updated on a pull request from a fork." };
  }
  const agent: RefreshAgent = input.refresh;
  if (!input.env[REFRESH_KEYS[agent]]) return { run: false, reason: `refresh: ${agent} needs ${REFRESH_KEYS[agent]} in the step's env.` };
  if (input.head === null || input.head !== event?.pull_request?.head?.sha) {
    return { run: false, reason: "Updating the map needs the pull request's head checked out. Set ref to github.head_ref in actions/checkout." };
  }
  const paths = branchPaths(input.report, input.components);
  if (paths.length === 0) return { run: false, reason: null };
  return { run: true, agent, paths };
}

/** The agent's argument vector and its whole environment: the sidebar's headless launch in `home`, with only the key. */
export function refreshCommand(agent: RefreshAgent, map: string, paths: readonly string[], home: string, env: NodeJS.ProcessEnv): { args: string[]; env: Record<string, string> } {
  const skillDir = join(home, agent === "claude" ? ".claude" : ".agents", "skills", "sustain-refresh");
  const args = headlessArgs(agent, skillPrompt(agent, "sustain-refresh", refreshArgs(map, paths)), { skillDir, scripts: SKILL_SCRIPTS["sustain-refresh"] });
  const key = env[REFRESH_KEYS[agent]] ?? "";
  const keys: Record<string, string> = agent === "claude" ? { ANTHROPIC_API_KEY: key } : { OPENAI_API_KEY: key, CODEX_API_KEY: key };
  return { args, env: { PATH: env["PATH"] ?? "", HOME: home, LANG: "C.UTF-8", ...agentHomePreview(home, agent), ...keys } };
}

export type RefreshOutcome = { ok: true; run: string; summary: string; tokens: number } | { ok: false; reason: string };

function git(root: string, args: string[]): string | null {
  const program = findOnPath("git", process.env);
  if (program === undefined) return null;
  const result = spawnSync(program, ["-c", "core.fsmonitor=false", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return result.status === 0 ? result.stdout : null;
}

/** Runs the update, commits the new run folder and pushes it to `headRef`. */
export function runRefresh(input: { root: string; map: string; agent: RefreshAgent; paths: readonly string[]; headRef: string; skillSource: string; env: NodeJS.ProcessEnv }): RefreshOutcome {
  const binary = findOnPath(input.agent, input.env);
  if (binary === undefined) return { ok: false, reason: `refresh: ${input.agent} needs the ${input.agent} CLI on PATH; install it in an earlier step.` };
  const home = mkdtempSync(join(tmpdir(), "sustain-refresh-"));
  try {
    agentHome(home, input.agent, { name: "sustain-refresh", source: input.skillSource });
    const { args, env } = refreshCommand(input.agent, input.map, input.paths, home, input.env);
    const before = runFolderNames(input.root);
    const result = spawnSync(binary, args, { cwd: input.root, env, shell: false, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: REFRESH_TIMEOUT_MS });
    const usage = summarizeStream(result.stdout ?? "", input.agent === "claude" ? claudeParser() : codexParser()).usage;
    const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
    const made = newRunSince(input.root, before);
    if (made === null || made.record.phase !== "accepted") return { ok: false, reason: `the refresh ended without an accepted map (exit ${result.status ?? "none"}).` };
    const read = (run: string): ReturnType<typeof readDiagram> => readDiagram(JSON.parse(readFileSync(join(input.root, ARCHIFY_DIR, run, CANDIDATE_FILE), "utf8")));
    const older = read(input.map);
    const newer = read(made.runFolder);
    const summary = older.ok && newer.ok ? diffSummary(diffMaps(older.diagram, newer.diagram)) : "the map changed";
    const folder = `${ARCHIFY_DIR}/${made.runFolder}`;
    const committed =
      git(input.root, ["add", "-f", "--", folder]) !== null &&
      git(input.root, ["-c", "user.name=Sustain", "-c", "user.email=sustain@users.noreply.github.com", "-c", "commit.gpgsign=false", "commit", "-q", "-m", `Update the architecture map for this pull request\n\n${summary}.`, "--", folder]) !== null &&
      git(input.root, ["push", "-q", "origin", `HEAD:refs/heads/${input.headRef}`]) !== null;
    if (!committed) return { ok: false, reason: `the new map ${made.runFolder} could not be committed and pushed to ${input.headRef}.` };
    return { ok: true, run: made.runFolder, summary, tokens };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** The comment's lines about the update. */
export function refreshLines(outcome: RefreshOutcome | { ok: false; reason: string }): string[] {
  if (!outcome.ok) return ["", "**Map update**", "", `The map was not updated. ${outcome.reason.charAt(0).toUpperCase()}${outcome.reason.slice(1)}`];
  return ["", "**Map update**", "", `Sustain refreshed the map in \`${outcome.run}\` and pushed it to this branch. ${outcome.summary.charAt(0).toUpperCase()}${outcome.summary.slice(1)}. It used ${outcome.tokens.toLocaleString("en-US")} tokens.`];
}
