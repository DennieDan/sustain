// Git facts through the git CLI (FR-GIT-01), ported from the prototype's
// `archalign-repo/src/git.rs`. Git runs with a fixed argv, never through a shell.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import type { CommitInfo } from "./lineage";
import type { Repository } from "./types";

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

/** The fixed argument vectors; each starts with `--no-optional-locks`. */
export const GIT_READS = {
  topLevel: ["--no-optional-locks", "rev-parse", "--show-toplevel"],
  head: ["--no-optional-locks", "rev-parse", "--verify", "--quiet", "HEAD"],
  origin: ["--no-optional-locks", "config", "--get", "remote.origin.url"],
  status: ["--no-optional-locks", "status", "--porcelain=v1", "-z"],
  /** `+ <base>^{commit}`: exits 0 when the commit is in the object store (FR-UPD-02). */
  commitExists: ["--no-optional-locks", "cat-file", "-e"],
  /** `+ <base> HEAD`: exits 0 when base is an ancestor of HEAD (FR-UPD-02). */
  isAncestor: ["--no-optional-locks", "merge-base", "--is-ancestor"],
  /** `+ <base> --`: base against the working tree, paths verbatim (FR-UPD-03). */
  nameStatus: ["--no-optional-locks", "diff", "--name-status", "-z", "--find-renames", "--no-color", "--no-ext-diff"],
  /** `+ <base> --`: unified diff of base against the working tree (FR-UPD-03). */
  diff: [
    "--no-optional-locks",
    "diff",
    "--find-renames",
    "--no-color",
    "--no-ext-diff",
    "--no-textconv",
    "--unified=3",
    "--src-prefix=a/",
    "--dst-prefix=b/",
  ],
  /** Untracked, not ignored files, NUL-separated (FR-UPD-03). */
  untracked: ["--no-optional-locks", "ls-files", "-z", "--others", "--exclude-standard"],
  /** `+ <rev> --`: subject and committer date, NUL-separated (FR-CMP-01). */
  commitInfo: ["--no-optional-locks", "log", "-1", "--no-color", "--no-show-signature", "--format=%s%x00%cI"],
} as const;

/** stdout of a successful run; `null` when git cannot start (not on PATH) or exits non-zero. */
function run(program: string, root: string, argv: readonly string[]): string | null {
  const result = spawnSync(program, argv, {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.toString("utf8");
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
export function collectGitFacts(root: string, program = "git"): GitFacts | null {
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

/** A full commit name: 40 lowercase hex characters. */
export function isRevision(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}

/** Whether `base` is a commit in the object store and an ancestor of (or equal to) HEAD. */
export function baseReachable(root: string, base: string, program = "git"): boolean {
  if (!isRevision(base)) return false;
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

/** The three reads of FR-UPD-03, or `null` when any of them fails (or outgrows the 64 MiB buffer). */
export function readChanges(root: string, base: string, program = "git"): ChangeReads | null {
  if (!isRevision(base)) return null;
  const nameStatus = run(program, root, [...GIT_READS.nameStatus, base, "--"]);
  const diff = run(program, root, [...GIT_READS.diff, base, "--"]);
  const untracked = run(program, root, GIT_READS.untracked);
  if (nameStatus === null || diff === null || untracked === null) return null;
  return { nameStatus, diff, untracked };
}

/**
 * Subject and committer date of `revision` (FR-CMP-01), or `null` when it is not a full commit
 * name, git fails (unknown commit, no git) or the output is not `subject\0date\n`.
 */
export function commitInfo(root: string, revision: string, program = "git"): CommitInfo | null {
  if (!isRevision(revision)) return null;
  const output = run(program, root, [...GIT_READS.commitInfo, revision, "--"]);
  const match = output === null ? null : /^([^\0\n]*)\0([^\0\n]+)\n?$/.exec(output);
  if (!match) return null;
  return { subject: match[1]!, committedAt: match[2]! };
}
