// FR-RF-01 (and FR-GIT-01 through the CLI) against the built repo-facts.mjs.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, test } from "vitest";
import { runTimestamp } from "../../../src/model/runFolder";
import { envWithoutGit, git, gitRepo, put, runScript, tempDir } from "../support/temp";

const RUN_NAME = /^architecture-([a-z0-9-]+)-(\d{8}-\d{6})(-\d+)?$/;

describe("FR-RF-01 repo-facts CLI", () => {
  test("creates the run folder and prints root, runFolder, draft and git", () => {
    const root = tempDir();
    const run = runScript("repo-facts", ["--focus", "Payment service: retries & queues"], { cwd: root, env: envWithoutGit() });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    const facts = run.json();
    expect(Object.keys(facts)).toEqual(["root", "runFolder", "draft", "git"]);
    expect(facts.root).toBe(root);
    const name = facts.runFolder.replace(/^\.archify\//, "");
    expect(name).toMatch(RUN_NAME);
    expect(RUN_NAME.exec(name)![1]).toBe("payment-service-retries-queues");
    expect(facts.draft).toBe(`${facts.runFolder}/draft.json`);
    expect(readdirSync(join(root, facts.runFolder))).toEqual([]);
    expect(facts.git).toBeNull();
  });

  test("without --focus the slug comes from the repo folder name", () => {
    const root = join(tempDir(), "My Repo!");
    put(root, "README.md", "x\n");
    const facts = runScript("repo-facts", [], { cwd: root, env: envWithoutGit() }).json();
    expect(RUN_NAME.exec(facts.runFolder.slice(".archify/".length))![1]).toBe("my-repo");
    expect(basename(facts.root)).toBe("My Repo!");
  });

  test("an empty --focus falls back to the folder name", () => {
    const root = join(tempDir(), "backend_api");
    put(root, "README.md", "x\n");
    const facts = runScript("repo-facts", ["--focus", ""], { cwd: root, env: envWithoutGit() }).json();
    expect(RUN_NAME.exec(facts.runFolder.slice(".archify/".length))![1]).toBe("backend-api");
  });

  test("a name collision appends -2", () => {
    const root = tempDir();
    // Occupy the base name for every second the run could start in, so it must collide.
    const now = Date.now();
    const taken = [0, 1, 2, 3, 4, 5].map((s) => `architecture-api-${runTimestamp(new Date(now + s * 1000))}`);
    for (const name of taken) mkdirSync(join(root, ".archify", name), { recursive: true });
    const name = runScript("repo-facts", ["--focus", "api"], { cwd: root }).json().runFolder.slice(".archify/".length);
    expect(taken.map((base) => `${base}-2`)).toContain(name);
    expect(existsSync(join(root, ".archify", name))).toBe(true);
  });

  test("git facts come from the repo root", () => {
    const root = gitRepo({ "a.txt": "a\n" });
    git(root, "remote", "add", "origin", "https://user:pw@github.com/acme/widget.git");
    writeFileSync(join(root, "a.txt"), "changed\n");
    const facts = runScript("repo-facts", [], { cwd: root }).json();
    expect(facts.git).toEqual({
      head: git(root, "rev-parse", "HEAD").trim(),
      origin: "https://github.com/acme/widget.git",
      dirtyCount: 1,
      dirty: ["a.txt"],
    });
  });

  test("git absent from PATH gives git: null and still succeeds", () => {
    const root = gitRepo({ "a.txt": "a\n" });
    const run = runScript("repo-facts", [], { cwd: root, env: envWithoutGit() });
    expect(run.status).toBe(0);
    expect(run.json().git).toBeNull();
  });

  test.each([[["--focus"]], [["--bogus"]], [["--focus", "a", "b"]]])("bad arguments %j exit 2 with no stdout", (args) => {
    const run = runScript("repo-facts", args, { cwd: tempDir() });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/usage/);
  });

  test("an unusable .archify exits 2", () => {
    const root = tempDir();
    writeFileSync(join(root, ".archify"), "not a folder");
    const run = runScript("repo-facts", [], { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
  });
});
