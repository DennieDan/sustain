import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach } from "vitest";
import { SCRIPTS_DIR } from "./buildScripts";

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A fresh real-path temp folder, removed after the current test. */
export function tempDir(prefix = "sustain-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  created.push(dir);
  return dir;
}

/** Writes `content` at `root/rel`, creating parent folders. */
export function put(root: string, rel: string, content: string | Uint8Array): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Runs git isolated from the user's and system configuration (no signing, fixed identity). */
export function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args],
    { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" } },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
}

/** A committed repo containing `files`. */
export function gitRepo(files: Record<string, string>): string {
  const root = tempDir("sustain-git-");
  git(root, "init", "-q");
  for (const [rel, content] of Object.entries(files)) put(root, rel, content);
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

/** validate.mjs stdout (FR-VAL-01). */
export interface ValidateReport {
  status: "accepted" | "rejected";
  candidate?: string;
  errors: { pointer: string; message: string }[];
  warnings: { pointer: string; message: string }[];
  hint?: string;
}

/** repo-facts.mjs stdout (FR-RF-01). */
export interface RepoFacts {
  root: string;
  runFolder: string;
  draft: string;
  git: { head: string; origin: string | null; dirtyCount: number; dirty: string[] } | null;
}

/** change-map.mjs stdout (FR-UPD-01). */
export interface ChangeMapReport {
  mode: "update" | "regenerate";
  reason: string;
  previous: string | null;
  baseRevision: string | null;
  head: string | null;
  changeFile: string | null;
  mappingFile: string | null;
  touchedComponents: string[];
  untouchedComponents: string[];
  uncitedFiles: string[];
}

/** match-ids.mjs stdout (FR-UPD-09). */
export interface MatchIdsReport {
  componentMap: Record<string, string>;
  connectionMap: Record<string, string>;
  renamed: Record<string, string>;
}

type Outputs = { validate: ValidateReport; "repo-facts": RepoFacts; "change-map": ChangeMapReport; "match-ids": MatchIdsReport };

export interface ScriptRun<Output> {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout parsed as JSON; throws when it is not exactly one JSON value. */
  json(): Output;
}

interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

/** Runs a built skill script with `node`, as the agent does. */
export function runScript<S extends keyof Outputs>(script: S, args: string[], options: RunOptions): ScriptRun<Outputs[S]> {
  const result = spawnSync(process.execPath, [join(SCRIPTS_DIR, `${script}.mjs`), ...args], {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    // Names the documented output contract; the tests assert every field they read.
    json: () => JSON.parse(result.stdout) as Outputs[S],
  };
}

/** An environment whose PATH holds no `git` (only an empty folder). */
export function envWithoutGit(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: tempDir("sustain-nogit-") };
}
