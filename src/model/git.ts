// Git facts through the git CLI (FR-GIT-01), ported from the prototype's
// `archalign-repo/src/git.rs`. Git runs by absolute path with a fixed argv, never through a
// shell, and with the repository's fsmonitor hook switched off (SAF-07).
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { REVISION_PATTERN } from "./changes";
import type { Repository } from "./types";
import { findOnPath } from "./which";

/** Most dirty paths reported; `dirtyCount` carries the total. */
export const MAX_DIRTY_PATHS = 200;

export interface GitFacts {
  /** HEAD commit, 40 lowercase hex characters. */
  head: string;
  /** `remote.origin.url` with HTTP(S) userinfo removed, or `null` without an origin. */
  origin: string | null;
  /** Total number of paths `git status` reports. */
  dirtyCount: number;
  /** The first {@link MAX_DIRTY_PATHS} of them, repo-relative with `/` separators. */
  dirty: string[];
}

/** Every git call starts with these. A repository's `core.fsmonitor` can name a program to run. */
export const GIT_PREFIX = ["-c", "core.fsmonitor=false", "--no-optional-locks"] as const;

/** The fixed argument vectors; each starts with {@link GIT_PREFIX}. */
export const GIT_READS = {
  topLevel: [...GIT_PREFIX, "rev-parse", "--show-toplevel"],
  head: [...GIT_PREFIX, "rev-parse", "--verify", "--quiet", "HEAD"],
  origin: [...GIT_PREFIX, "config", "--get", "remote.origin.url"],
  status: [...GIT_PREFIX, "status", "--porcelain=v1", "-z"],
} as const;

/** Absolute path of the git binary from absolute PATH entries, or `undefined`. */
export function gitProgram(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return findOnPath("git", env);
}

/** stdout bytes of a successful run; `null` when git cannot start (not on PATH) or exits non-zero. */
function runRaw(program: string, root: string, argv: readonly string[]): Buffer | null {
  const result = spawnSync(program, argv, {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

/** stdout of a successful run as text, or `null`. */
function run(program: string, root: string, argv: readonly string[]): string | null {
  return runRaw(program, root, argv)?.toString("utf8") ?? null;
}

/**
 * Strips HTTP(S) userinfo (`user:token@`) from a remote URL, keeping scheme, host, port,
 * path and suffix. Other forms (ssh, scp-style, file, plain paths) are returned unchanged.
 */
export function sanitizeOrigin(url: string): string {
  const match = /^(https?):\/\/(.*)$/is.exec(url);
  if (!match) return url;
  const scheme = match[1]!;
  const rest = match[2]!;
  const authorityEnd = rest.search(/[/?#]/);
  const authority = authorityEnd < 0 ? rest : rest.slice(0, authorityEnd);
  const tail = authorityEnd < 0 ? "" : rest.slice(authorityEnd);
  const host = authority.slice(authority.lastIndexOf("@") + 1);
  return `${scheme}://${host}${tail}`;
}

/**
 * Parses `git status --porcelain=v1 -z`. Renames and copies are followed by their original
 * path, which is skipped: the new path is reported.
 */
export function parsePorcelainZ(output: string): string[] {
  const fields = output.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const record = fields[i]!;
    if (record.length < 4) continue;
    paths.push(record.slice(3));
    if (/[RC]/.test(record.slice(0, 2))) i += 1;
  }
  return paths;
}

/**
 * Git facts for `root`, or `null` when git is not on PATH, `root` is not inside a work
 * tree, is a subfolder of one, or HEAD does not exist yet. Never throws for those cases.
 */
export function collectGitFacts(root: string, env: NodeJS.ProcessEnv = process.env): GitFacts | null {
  const program = gitProgram(env);
  if (program === undefined) return null;
  const top = run(program, root, GIT_READS.topLevel);
  if (top === null) return null;
  try {
    if (realpathSync(top.trim()) !== realpathSync(root)) return null;
  } catch {
    return null;
  }
  const head = run(program, root, GIT_READS.head)?.trim().toLowerCase();
  if (head === undefined || !/^[0-9a-f]{40}$/.test(head)) return null;

  const origin = run(program, root, GIT_READS.origin)?.trim() ?? "";
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "");
  return {
    head,
    origin: origin === "" ? null : sanitizeOrigin(origin),
    dirtyCount: allDirty.length,
    dirty: allDirty.slice(0, MAX_DIRTY_PATHS),
  };
}

/**
 * `meta.repository` for these facts, or `null` without an origin. HTTPS origins on
 * github.com / gitee.com get `provider`; any other origin gets `link_mode: "local-only"`.
 */
export function repositoryFromGit(facts: GitFacts): Repository | null {
  if (facts.origin === null) return null;
  const authority = /^https:\/\/([^/?#]*)/i.exec(facts.origin)?.[1];
  const host = authority?.slice(authority.lastIndexOf("@") + 1).split(":")[0]?.toLowerCase();
  if (host === "github.com") return { url: facts.origin, revision: facts.head, provider: "github" };
  if (host === "gitee.com") return { url: facts.origin, revision: facts.head, provider: "gitee" };
  return { url: facts.origin, revision: facts.head, link_mode: "local-only" };
}

/**
 * Paths git followed through a rename since `revision`, old to new, from
 * `git diff -M --name-status -z <revision>` (FRS-02). Empty when git or the revision is missing.
 */
export function renamesSince(root: string, revision: string, env: NodeJS.ProcessEnv = process.env, to?: string): Map<string, string> {
  const renames = new Map<string, string>();
  const program = gitProgram(env);
  if (program === undefined || !/^[0-9a-f]{7,64}$/i.test(revision) || (to !== undefined && !REVISION_PATTERN.test(to))) return renames;
  const output = run(program, root, [...GIT_PREFIX, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--name-status", "-z", revision, ...(to === undefined ? [] : [to]), "--"]);
  const fields = (output ?? "").split("\0");
  for (let i = 0; i < fields.length; i++) {
    const status = fields[i]!;
    if (/^[RC]\d*$/.test(status)) {
      if (status.startsWith("R")) renames.set(fields[i + 1]!, fields[i + 2]!);
      i += 2;
    } else if (/^[AMDTUX]$/.test(status)) {
      i += 1;
    }
  }
  return renames;
}

/** What Show Changes compares (FRS-04). */
export type ChangeScope = { kind: "uncommitted" } | { kind: "branch" } | { kind: "range"; from: string; to: string };

/** The diff flags every change scope uses: no colour, external diff or textconv, and fixed prefixes. */
export const DIFF_FLAGS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=0", "-M", "--src-prefix=a/", "--dst-prefix=b/"] as const;


/** The branch "this branch" is compared with: origin/HEAD, else main, else master, or `null`. */
export function defaultBranch(root: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined) return null;
  return ["origin/HEAD", "main", "master"].find((ref) => run(program, root, [...GIT_PREFIX, "rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) !== null) ?? null;
}

/** Where "this branch" starts: the merge-base of HEAD with the default branch. */
function branchBase(program: string, root: string, env: NodeJS.ProcessEnv): string | null {
  const ref = defaultBranch(root, env);
  return ref === null ? null : run(program, root, [...GIT_PREFIX, "merge-base", "HEAD", ref])?.trim() || null;
}

export type ChangeDiff = { ok: true; text: string; untracked: string[] } | { ok: false; reason: string };

/**
 * The unified diff for `scope`, against the working tree for the uncommitted and branch scopes,
 * with their untracked files.
 */
export function diffFor(root: string, scope: ChangeScope, env: NodeJS.ProcessEnv = process.env): ChangeDiff {
  const program = gitProgram(env);
  if (program === undefined) return { ok: false, reason: "git was not found on PATH." };
  if (run(program, root, GIT_READS.head) === null) return { ok: false, reason: "This folder is not a git repository with a commit." };
  let revisions: string[];
  if (scope.kind === "uncommitted") revisions = ["HEAD"];
  else if (scope.kind === "branch") {
    const base = branchBase(program, root, env);
    if (base === null) return { ok: false, reason: "No origin/HEAD, main or master to compare this branch with." };
    revisions = [base];
  } else {
    if (![scope.from, scope.to].every((revision) => REVISION_PATTERN.test(revision))) return { ok: false, reason: "A commit range looks like main..HEAD." };
    revisions = [scope.from, scope.to];
  }
  const text = run(program, root, [...GIT_PREFIX, ...DIFF_FLAGS, ...revisions, "--"]);
  if (text === null) return { ok: false, reason: `git diff ${revisions.join(" ")} failed.` };
  const untracked = scope.kind === "range" ? [] : untrackedFiles(root, env);
  return { ok: true, text, untracked };
}

/** One changed file's line counts; `null` counts for a binary file. */
export interface ChangeStat {
  path: string;
  added: number | null;
  deleted: number | null;
}

/** Files changed since `revision`, working tree included, from `git diff --numstat -M -z` (FRS-05). */
export function numstatSince(root: string, revision: string, env: NodeJS.ProcessEnv = process.env): ChangeStat[] | null {
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(revision)) return null;
  const output = run(program, root, [...GIT_PREFIX, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--numstat", "-M", "-z", revision, "--"]);
  if (output === null) return null;
  const stats: ChangeStat[] = [];
  const fields = output.split("\0");
  for (let i = 0; i < fields.length; i++) {
    const record = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(fields[i]!);
    if (!record) continue;
    const count = (value: string): number | null => (value === "-" ? null : Number(value));
    // A rename has an empty path field followed by the old and new paths.
    let path = record[3]!;
    if (path === "") {
      path = fields[i + 2] ?? "";
      i += 2;
    }
    stats.push({ path, added: count(record[1]!), deleted: count(record[2]!) });
  }
  return stats;
}

/** Tracked regular files, relative to `root`, or `null` when git cannot list them (CST-01). Links and submodules are left out. */
export function trackedFiles(root: string, env: NodeJS.ProcessEnv = process.env): string[] | null {
  const program = gitProgram(env);
  if (program === undefined) return null;
  const output = run(program, root, [...GIT_PREFIX, "ls-files", "--stage", "-z"]);
  if (output === null) return null;
  const files: string[] = [];
  for (const entry of output.split("\0")) {
    const tab = entry.indexOf("\t");
    if (tab > 0 && (entry.startsWith("100644 ") || entry.startsWith("100755 "))) files.push(entry.slice(tab + 1));
  }
  return files;
}

/**
 * The `paths` that `.gitattributes` marks `linguist-generated` or `linguist-vendored`, the marks
 * GitHub's language statistics follow (CST-01). Empty when git cannot tell.
 */
export function generatedFiles(root: string, paths: readonly string[], env: NodeJS.ProcessEnv = process.env): Set<string> {
  const program = gitProgram(env);
  if (program === undefined || paths.length === 0) return new Set();
  const result = spawnSync(program, [...GIT_PREFIX, "check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    input: paths.join("\0"),
    stdio: ["pipe", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return new Set();
  const fields = result.stdout.toString("utf8").split("\0");
  const marked = new Set<string>();
  for (let i = 0; i + 2 < fields.length; i += 3) if (fields[i + 2] === "set" || fields[i + 2] === "true") marked.add(fields[i]!);
  return marked;
}

/** One commit of {@link changeLog}: its author's email, used only to count authors, and each file's added and deleted lines. */
export interface LoggedCommit {
  commit: string;
  author: string;
  files: { path: string; added: number; deleted: number }[];
}

/** The commits of the last `days` days on the current branch, without merges or renames (ARC-03), or `null` when git cannot tell. */
export function changeLog(root: string, days: number, env: NodeJS.ProcessEnv = process.env): LoggedCommit[] | null {
  const program = gitProgram(env);
  if (program === undefined || !Number.isInteger(days) || days < 1) return null;
  // --since stops at the first older commit, so an out-of-order date hides the rest; git 2.37's
  // --since-as-filter checks every commit, and older git falls back to --since.
  const args = (since: string): string[] => [...GIT_PREFIX, "-c", "core.quotepath=off", "log", `${since}=${days} days ago`, "--no-merges", "--no-renames", "--numstat", "--format=@@%H%x09%aE"];
  const output = run(program, root, args("--since-as-filter")) ?? run(program, root, args("--since"));
  if (output === null) return null;
  const commits: LoggedCommit[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("@@")) {
      const [commit, author] = line.slice(2).split("\t");
      commits.push({ commit: commit!, author: author ?? "", files: [] });
      continue;
    }
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (match && commits.length > 0) commits.at(-1)!.files.push({ path: match[3]!, added: match[1] === "-" ? 0 : Number(match[1]), deleted: match[2] === "-" ? 0 : Number(match[2]) });
  }
  return commits;
}

/** Untracked files that are not ignored, repository-relative. */
export function untrackedFiles(root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const program = gitProgram(env);
  if (program === undefined) return [];
  return (run(program, root, [...GIT_PREFIX, "ls-files", "--others", "--exclude-standard", "-z"]) ?? "").split("\0").filter((path) => path !== "");
}

/** The top-level folders that existed at `revision`, or `null` when git cannot tell. */
export function foldersAt(root: string, revision: string, env: NodeJS.ProcessEnv = process.env): Set<string> | null {
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(revision)) return null;
  const output = run(program, root, [...GIT_PREFIX, "ls-tree", "-d", "--name-only", "-z", revision]);
  return output === null ? null : new Set(output.split("\0").filter((name) => name !== ""));
}

/** The commit `a` and `b` share, or `null`. */
export function mergeBase(root: string, a: string, b: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(a) || !REVISION_PATTERN.test(b)) return null;
  return run(program, root, [...GIT_PREFIX, "merge-base", a, b])?.trim() || null;
}

/** The unified diff from `from` to `to`, or to the working tree without `to` (PRC-01). */
export function diffBetween(root: string, from: string, to: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined || ![from, ...(to === null ? [] : [to])].every((revision) => REVISION_PATTERN.test(revision))) return null;
  return run(program, root, [...GIT_PREFIX, ...DIFF_FLAGS, from, ...(to === null ? [] : [to]), "--"]);
}

/** A file's bytes at `revision`, or `null` when it is not there. */
export function fileAt(root: string, revision: string, path: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(revision) || path.startsWith("-") || path.includes(":")) return null;
  return runRaw(program, root, [...GIT_PREFIX, "cat-file", "blob", `${revision}:${path}`]);
}

/** Whether `path`, a file or folder, exists at `revision`. The repository root always does. */
export function existsAt(root: string, revision: string, path: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (path === "") return true;
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(revision) || path.startsWith("-") || path.includes(":")) return false;
  return run(program, root, [...GIT_PREFIX, "cat-file", "-e", `${revision}:${path}`]) !== null;
}

/** Every file under `dir` at `revision`, repository-relative. */
export function filesAt(root: string, revision: string, dir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const program = gitProgram(env);
  if (program === undefined || !REVISION_PATTERN.test(revision)) return [];
  const output = run(program, root, [...GIT_PREFIX, "ls-tree", "-r", "-z", "--name-only", revision, "--", dir === "" ? "." : dir]);
  return (output ?? "").split("\0").filter((path) => path !== "");
}

/** The checked-out branch's name, or `null` for a detached HEAD or without git. */
export function currentBranch(root: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined) return null;
  const name = run(program, root, [...GIT_PREFIX, "symbolic-ref", "--quiet", "--short", "HEAD"])?.trim();
  return name ? name : null;
}
