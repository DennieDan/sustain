// Git facts through the git CLI (FR-GIT-01), ported from the prototype's
// `archalign-repo/src/git.rs`. Git runs by absolute path with a fixed argv, never through a
// shell, and with the repository's fsmonitor hook switched off (SAF-07).
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { isRevision, parseNameStatusZ, parsePorcelainZ } from "../core/gitFormat";
import type { CommitInfo } from "../core/lineage";
import type { Repository } from "../core/types";
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
  /** `+ <base>^{commit}`: exits 0 when the commit is in the object store (FR-UPD-02). */
  commitExists: [...GIT_PREFIX, "cat-file", "-e"],
  /** `+ <base> HEAD`: exits 0 when base is an ancestor of HEAD (FR-UPD-02). */
  isAncestor: [...GIT_PREFIX, "merge-base", "--is-ancestor"],
  /** `+ <base> --`: base against the working tree, paths verbatim (FR-UPD-03). */
  nameStatus: [...GIT_PREFIX, "diff", "--name-status", "-z", "--find-renames", "--no-color", "--no-ext-diff"],
  /** `+ <base> --`: unified diff of base against the working tree (FR-UPD-03). */
  diff: [...GIT_PREFIX, "diff", "--find-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=3", "--src-prefix=a/", "--dst-prefix=b/"],
  /** Untracked, not ignored files, NUL-separated (FR-UPD-03). */
  untracked: [...GIT_PREFIX, "ls-files", "-z", "--others", "--exclude-standard"],
  /** `+ <rev> --`: subject and committer date, NUL-separated (FR-CMP-01). */
  commitInfo: [...GIT_PREFIX, "log", "-1", "--no-color", "--no-show-signature", "--format=%s%x00%cI"],
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
  if (head === undefined || !isRevision(head, "commit")) return null;

  const origin = run(program, root, GIT_READS.origin)?.trim() ?? "";
  // Sustain's own run folders are never repo dirt.
  const allDirty = parsePorcelainZ(run(program, root, GIT_READS.status) ?? "").filter((path) => !path.startsWith(".archify/"));
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

/** Whether `base` is a commit in the object store and an ancestor of (or equal to) HEAD. `program` defaults to the resolved git. */
export function baseReachable(root: string, base: string, program: string | undefined = gitProgram()): boolean {
  if (program === undefined || !isRevision(base, "commit")) return false;
  return (
    run(program, root, [...GIT_READS.commitExists, `${base}^{commit}`]) !== null &&
    run(program, root, [...GIT_READS.isAncestor, base, "HEAD"]) !== null
  );
}

/** Raw git output describing the change from a base commit to the working tree. */
export interface ChangeReads {
  /** `git diff --name-status -z` output. */
  nameStatus: string;
  /** Unified diff with `a/`/`b/` prefixes. */
  diff: string;
  /** `git ls-files -z --others --exclude-standard` output. */
  untracked: string;
}

/** The three reads of FR-UPD-03, or `null` when any of them fails (or outgrows the 64 MiB buffer). `program` defaults to the resolved git. */
export function readChanges(root: string, base: string, program: string | undefined = gitProgram()): ChangeReads | null {
  if (program === undefined || !isRevision(base, "commit")) return null;
  const nameStatus = run(program, root, [...GIT_READS.nameStatus, base, "--"]);
  const diff = run(program, root, [...GIT_READS.diff, base, "--"]);
  const untracked = run(program, root, GIT_READS.untracked);
  if (nameStatus === null || diff === null || untracked === null) return null;
  return { nameStatus, diff, untracked };
}

/**
 * Subject and committer date of `revision` (FR-CMP-01), or `null` when it is not a full commit
 * name, git fails (unknown commit, no git) or the output is not `subject\0date\n`. `program`
 * defaults to the resolved git.
 */
export function commitInfo(root: string, revision: string, program: string | undefined = gitProgram()): CommitInfo | null {
  if (program === undefined || !isRevision(revision, "commit")) return null;
  const output = run(program, root, [...GIT_READS.commitInfo, revision, "--"]);
  const match = output === null ? null : /^([^\0\n]*)\0([^\0\n]+)\n?$/.exec(output);
  if (!match) return null;
  return { subject: match[1]!, committedAt: match[2]! };
}

/**
 * Paths git followed through a rename since `revision`, old to new, from
 * `git diff -M --name-status -z <revision>` (FRS-02). Empty when git or the revision is missing.
 */
export function renamesSince(root: string, revision: string, env: NodeJS.ProcessEnv = process.env, to?: string): Map<string, string> {
  const renames = new Map<string, string>();
  const program = gitProgram(env);
  if (program === undefined || !isRevision(revision, "name") || (to !== undefined && !isRevision(to, "name"))) return renames;
  const output = run(program, root, [...GIT_PREFIX, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "-M", "--name-status", "-z", revision, ...(to === undefined ? [] : [to]), "--"]);
  for (const entry of parseNameStatusZ(output ?? "")) {
    if (entry.status.startsWith("R") && entry.oldPath !== undefined) renames.set(entry.oldPath, entry.path);
  }
  return renames;
}

/** The flags of every diff Sustain reads: no colour, external diff or textconv, and fixed prefixes. */
export const DIFF_FLAGS = ["diff", "--no-color", "--no-ext-diff", "--no-textconv", "--unified=0", "-M", "--src-prefix=a/", "--dst-prefix=b/"] as const;

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
  return (run(program, root, GIT_READS.untracked) ?? "").split("\0").filter((path) => path !== "");
}

/** The commit `a` and `b` share, or `null`. */
export function mergeBase(root: string, a: string, b: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined || !isRevision(a, "name") || !isRevision(b, "name")) return null;
  return run(program, root, [...GIT_PREFIX, "merge-base", a, b])?.trim() || null;
}

/** The unified diff from `from` to `to`, or to the working tree without `to` (PRC-01). */
export function diffBetween(root: string, from: string, to: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const program = gitProgram(env);
  if (program === undefined || ![from, ...(to === null ? [] : [to])].every((revision) => isRevision(revision, "name"))) return null;
  return run(program, root, [...GIT_PREFIX, ...DIFF_FLAGS, from, ...(to === null ? [] : [to]), "--"]);
}

/** A file's bytes at `revision`, or `null` when it is not there. */
export function fileAt(root: string, revision: string, path: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const program = gitProgram(env);
  if (program === undefined || !isRevision(revision, "name") || path.startsWith("-") || path.includes(":")) return null;
  return runRaw(program, root, [...GIT_PREFIX, "cat-file", "blob", `${revision}:${path}`]);
}

/** Whether `path`, a file or folder, exists at `revision`. The repository root always does. */
export function existsAt(root: string, revision: string, path: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (path === "") return true;
  const program = gitProgram(env);
  if (program === undefined || !isRevision(revision, "name") || path.startsWith("-") || path.includes(":")) return false;
  return run(program, root, [...GIT_PREFIX, "cat-file", "-e", `${revision}:${path}`]) !== null;
}

/** Every file under `dir` at `revision`, repository-relative. */
export function filesAt(root: string, revision: string, dir: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const program = gitProgram(env);
  if (program === undefined || !isRevision(revision, "name")) return [];
  const output = run(program, root, [...GIT_PREFIX, "ls-tree", "-r", "-z", "--name-only", revision, "--", dir === "" ? "." : dir]);
  return (output ?? "").split("\0").filter((path) => path !== "");
}
