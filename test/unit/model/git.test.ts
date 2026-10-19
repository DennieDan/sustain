// FR-GIT-01: git facts, ported from the prototype's repo/tests/git.rs; FR-CMP-01 commit details. Runs the real `git`.
import { writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { collectGitFacts, commitInfo, GIT_READS, parsePorcelainZ, repositoryFromGit, sanitizeOrigin } from "../../../src/model/git";
import { git, gitRepo, put, tempDir } from "../support/temp";

const files = { "a.txt": "a\n", "b.txt": "b\n", "sub/c.txt": "c\n" };

describe("FR-GIT-01 git facts", () => {
  test("a clean repo reports HEAD and no dirty paths", () => {
    const root = gitRepo(files);
    const facts = collectGitFacts(root);
    expect(facts).not.toBeNull();
    expect(facts!.head).toMatch(/^[0-9a-f]{40}$/);
    expect(facts!.head).toBe(git(root, "rev-parse", "HEAD").trim());
    expect(facts!.dirty).toEqual([]);
    expect(facts!.dirtyCount).toBe(0);
    expect(facts!.origin).toBeNull();
  });

  test("a dirty repo reports modified, untracked and renamed paths", () => {
    const root = gitRepo(files);
    writeFileSync(`${root}/a.txt`, "changed\n");
    writeFileSync(`${root}/new file.txt`, "new\n");
    git(root, "mv", "b.txt", "sub/renamed.txt");
    const facts = collectGitFacts(root)!;
    expect([...facts.dirty].sort()).toEqual(["a.txt", "new file.txt", "sub/renamed.txt"]);
    expect(facts.dirtyCount).toBe(3);
  });

  test("dirty paths are capped at 200 with the total count kept", () => {
    const root = gitRepo(files);
    for (let i = 0; i < 205; i += 1) writeFileSync(`${root}/untracked-${String(i).padStart(3, "0")}.txt`, "x\n");
    const facts = collectGitFacts(root)!;
    expect(facts.dirty).toHaveLength(200);
    expect(facts.dirtyCount).toBe(205);
  });

  test("a repo without origin has no repository metadata", () => {
    const facts = collectGitFacts(gitRepo(files))!;
    expect(repositoryFromGit(facts)).toBeNull();
  });

  test("an origin with credentials is sanitized and maps to provider github", () => {
    const root = gitRepo(files);
    git(root, "remote", "add", "origin", "https://user:s3cret@github.com/acme/widget.git");
    const facts = collectGitFacts(root)!;
    expect(facts.origin).toBe("https://github.com/acme/widget.git");
    expect(repositoryFromGit(facts)).toEqual({ url: "https://github.com/acme/widget.git", revision: facts.head, provider: "github" });
  });

  test("a gitee HTTPS origin gets provider gitee", () => {
    const root = gitRepo(files);
    git(root, "remote", "add", "origin", "https://gitee.com/acme/widget");
    expect(repositoryFromGit(collectGitFacts(root)!)).toMatchObject({ provider: "gitee" });
  });

  test("a non-hosted origin is local-only", () => {
    const root = gitRepo(files);
    git(root, "remote", "add", "origin", "git@example.org:acme/widget.git");
    const facts = collectGitFacts(root)!;
    expect(repositoryFromGit(facts)).toEqual({ url: "git@example.org:acme/widget.git", revision: facts.head, link_mode: "local-only" });
  });

  test("a subfolder of a work tree has no git facts", () => {
    const root = gitRepo(files);
    expect(collectGitFacts(`${root}/sub`)).toBeNull();
  });

  test("a plain folder has no git facts", () => {
    expect(collectGitFacts(tempDir())).toBeNull();
  });

  test("a repo without commits has no git facts", () => {
    const root = tempDir();
    git(root, "init", "-q");
    expect(collectGitFacts(root)).toBeNull();
  });

  test("git missing from PATH gives no git facts and no error", () => {
    const root = gitRepo(files);
    expect(collectGitFacts(root, "sustain-no-such-git-binary")).toBeNull();
  });

  test.each([
    ["https://user:pass@github.com/a/b.git", "https://github.com/a/b.git"],
    ["https://token@github.com/a/b", "https://github.com/a/b"],
    ["https://u:p@git.example.com:8443/team/repo.git", "https://git.example.com:8443/team/repo.git"],
    ["http://u:p@host.local:8080/r.git", "http://host.local:8080/r.git"],
    ["https://u:p%40x@host/path@v1", "https://host/path@v1"],
    ["https://github.com/a/b.git", "https://github.com/a/b.git"],
    ["ssh://git@github.com/a/b.git", "ssh://git@github.com/a/b.git"],
    ["git@github.com:a/b.git", "git@github.com:a/b.git"],
    ["file:///srv/repo.git", "file:///srv/repo.git"],
    ["/srv/repo.git", "/srv/repo.git"],
  ])("sanitizeOrigin(%s) = %s", (input, expected) => {
    expect(sanitizeOrigin(input)).toBe(expected);
  });

  test("read commands are fixed argv starting with --no-optional-locks", () => {
    for (const argv of Object.values<readonly string[]>(GIT_READS)) {
      expect(argv[0]).toBe("--no-optional-locks");
      expect(argv.some((arg) => arg === "sh" || arg === "-c" || arg.includes(" "))).toBe(false);
    }
    expect(GIT_READS.status).toEqual(["--no-optional-locks", "status", "--porcelain=v1", "-z"]);
  });

  test("porcelain -z parsing takes the new path of renames and copies", () => {
    expect(parsePorcelainZ(" M a.txt\0R  new.txt\0old.txt\0?? dir/\0C  copy.txt\0orig.txt\0 D gone.txt\0")).toEqual([
      "a.txt",
      "new.txt",
      "dir/",
      "copy.txt",
      "gone.txt",
    ]);
    expect(parsePorcelainZ("")).toEqual([]);
    expect(parsePorcelainZ("X\0")).toEqual([]);
  });
});

describe("FR-CMP-01 commit details", () => {
  const headOf = (root: string): string => git(root, "rev-parse", "HEAD").trim();

  test("subject and committer date are read", () => {
    const root = gitRepo(files);
    const date = git(root, "log", "-1", "--format=%cI").trim();
    expect(commitInfo(root, headOf(root))).toEqual({ subject: "init", committedAt: date });
    expect(date).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(Z|[+-]\d\d:\d\d)$/);
  });

  test("only the first line of a multibyte subject is read, intact", () => {
    const root = gitRepo(files);
    put(root, "a.txt", "changed\n");
    git(root, "commit", "-q", "-am", "Ünïcødé 提交 — ✓\n\nBody line");
    expect(commitInfo(root, headOf(root))?.subject).toBe("Ünïcødé 提交 — ✓");
  });

  test("an unknown revision, a non-revision and missing git give null", () => {
    const root = gitRepo(files);
    expect(commitInfo(root, "0".repeat(40))).toBeNull();
    expect(commitInfo(root, "HEAD")).toBeNull();
    expect(commitInfo(tempDir(), "0".repeat(40))).toBeNull();
    expect(commitInfo(root, headOf(root), "sustain-no-such-git-binary")).toBeNull();
  });

  test("the argv is fixed", () => {
    expect(GIT_READS.commitInfo).toEqual(["--no-optional-locks", "log", "-1", "--no-color", "--no-show-signature", "--format=%s%x00%cI"]);
  });
});
