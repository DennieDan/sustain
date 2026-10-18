// CST-06: every run starts from a clean copy of a pinned commit with no agent configuration, and an
// agent home that holds only the skill. Clones are cached outside the repository.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { globToRegExp } from "../../src/model/refresh";
import { findOnPath } from "../../src/model/which";
import type { CorpusEntry } from "./corpus";

/** Agent configuration a repository may carry, removed at any depth before a run. */
export const AGENT_CONFIG = [".claude", ".codex", ".devin", ".agents", ".windsurf", "AGENTS.md", "CLAUDE.md"];

/** Where clones are cached: `SUSTAIN_BENCH_CACHE`, or `~/.cache/sustain-bench`. */
export function benchCache(env: NodeJS.ProcessEnv): string {
  return env["SUSTAIN_BENCH_CACHE"] ? resolve(env["SUSTAIN_BENCH_CACHE"]) : join(homedir(), ".cache", "sustain-bench");
}

/** What a run clones: this repository for ".", else the entry's URL. */
export function cloneSource(entry: CorpusEntry, repoRoot: string): string {
  return entry.url === "." ? repoRoot : entry.url!;
}

/** The cached mirror of an entry. */
export function mirrorPath(cache: string, entry: CorpusEntry): string {
  return join(cache, "repos", `${entry.id}.git`);
}

function git(cwd: string, args: string[]): string {
  const program = findOnPath("git", process.env);
  if (program === undefined) throw new Error("the bench needs git on PATH");
  const result = spawnSync(program, ["-c", "core.fsmonitor=false", "-c", "user.name=Sustain bench", "-c", "user.email=bench@invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

/** Paths under `root` whose name or relative path `matches`, outside `.git`; matched folders are not entered. */
function find(root: string, matches: (name: string, path: string) => boolean): string[] {
  const found: string[] = [];
  const pending = [""];
  while (pending.length > 0) {
    const dir = pending.pop()!;
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.name === ".git" && dir === "") continue;
      if (matches(entry.name, path)) found.push(path);
      else if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(path);
    }
  }
  return found.sort();
}

/** Removes {@link AGENT_CONFIG} at any depth, every path matching `strip`, and the folders that leaves empty. Returns what matched. */
export function cleanRepo(root: string, strip: readonly string[]): string[] {
  const patterns = strip.map(globToRegExp);
  const removed = [
    ...find(root, (name) => AGENT_CONFIG.includes(name)),
    ...find(root, (_name, path) => patterns.some((pattern) => pattern.test(path))),
  ];
  for (const path of removed) rmSync(join(root, path), { recursive: true, force: true });
  // Folders a strip emptied go too, so not even their names are left.
  for (const path of removed) {
    for (let dir = dirname(path); dir !== "." && existsSync(join(root, dir)) && readdirSync(join(root, dir)).length === 0; dir = dirname(dir)) rmdirSync(join(root, dir));
  }
  return removed;
}

/** `work` at `revision` of `entry`, cloned through the cache, or a fresh repository of its fixture; then cleaned. */
export function prepareRepo(entry: CorpusEntry, repoRoot: string, cache: string, work: string, revision: string | undefined): string[] {
  mkdirSync(dirname(work), { recursive: true });
  if (entry.fixture !== undefined) {
    cpSync(join(repoRoot, entry.fixture), work, { recursive: true });
    git(work, ["init", "-q"]);
    git(work, ["add", "-A"]);
    git(work, ["commit", "-q", "-m", "fixture"]);
  } else {
    const mirror = mirrorPath(cache, entry);
    mkdirSync(dirname(mirror), { recursive: true });
    if (!existsSync(mirror)) git(dirname(mirror), ["clone", "-q", "--mirror", cloneSource(entry, repoRoot), mirror]);
    else git(mirror, ["fetch", "-q", "--prune", "origin"]);
    git(dirname(work), ["clone", "-q", "--no-checkout", mirror, work]);
    git(work, ["checkout", "-q", "--detach", revision!]);
  }
  return cleanRepo(work, entry.strip);
}

// The isolated agent home lives in src/model/agentHome.ts, which the Action shares (PRC-05).
export { agentHome, agentHomePreview } from "../../src/model/agentHome";
