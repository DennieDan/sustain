// FR-UPD-01..04, FR-CMP-01 and FR-CMP-02 against the built change-map.mjs on temporary git repositories.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import type { CommitInfo, Lineage } from "../../../src/model/lineage";
import type { RunChanges } from "../../../src/core/runChanges";
import { envWithoutGit, git, gitRepo, put, runScript, tempDir, type ChangeMapReport } from "../support/temp";

const SLUG = "demo";
const OLD_RUN = `architecture-${SLUG}-20000101-000000`;

const files = {
  "src/web.ts": "export const web = 1;\n",
  "src/api.ts": "export const api = 1;\n",
  "src/db.ts": "export const db = 1;\n",
};

function candidate(revision?: string): Record<string, unknown> {
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: "Demo",
      output: `.archify/${OLD_RUN}/${SLUG}.html`,
      ...(revision ? { repository: { url: "https://github.com/acme/demo.git", revision, provider: "github" } } : {}),
    },
    components: [
      { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 1, end_line: 1 }] },
      { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts", line: 1, end_line: 1 }] },
      { id: "db", type: "database", label: "DB", sources: [{ path: "src/db.ts", line: 1, end_line: 1 }] },
    ],
    connections: [{ id: "web-api", from: "web", to: "api" }],
  };
}

function lineage(overrides: Partial<Lineage>): Lineage {
  return {
    mode: "regenerate",
    reason: "no-previous",
    previousRun: null,
    baseRevision: null,
    revision: null,
    baseCommit: null,
    headCommit: null,
    dirty: [],
    dirtyCount: 0,
    updatesSinceRegeneration: 0,
    ...overrides,
  };
}

/** A previous run folder with an accepted candidate and, optionally, a lineage. */
function seedPrevious(root: string, options: { doc?: unknown; lineage?: Lineage; run?: string } = {}): void {
  const dir = join(root, ".archify", options.run ?? OLD_RUN);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "candidate.sir"), JSON.stringify(options.doc ?? candidate(), null, 2));
  if (options.lineage) writeFileSync(join(dir, "lineage.json"), JSON.stringify(options.lineage, null, 2));
}

const head = (root: string): string => git(root, "rev-parse", "HEAD").trim();

/** What `commitInfo` should read for `rev`, taken from git directly. */
function commitOf(root: string, rev = "HEAD"): CommitInfo {
  const [subject, committedAt] = git(root, "log", "-1", "--format=%s%x00%cI", rev).replace(/\n$/, "").split("\0");
  return { subject: subject!, committedAt: committedAt! };
}

/** Runs repo-facts.mjs then change-map.mjs, as the skill does. */
function changeMap(root: string, extra: string[] = [], env?: NodeJS.ProcessEnv): { report: ChangeMapReport; runDir: string; runFolder: string } {
  const facts = runScript("repo-facts", ["--focus", SLUG], { cwd: root, env }).json();
  const run = runScript("change-map", ["--run-folder", facts.runFolder, ...extra], { cwd: root, env });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  return { report: run.json(), runDir: join(root, facts.runFolder), runFolder: facts.runFolder };
}

const readLineageFile = (runDir: string): Lineage => JSON.parse(readFileSync(join(runDir, "lineage.json"), "utf8"));
const readChangesFile = (runDir: string): RunChanges => JSON.parse(readFileSync(join(runDir, "changes.json"), "utf8"));

/** A repo with one commit and a previous candidate drawn at it (lineage revision = HEAD). */
function updatableRepo(lineageOverrides: Partial<Lineage> = {}): string {
  const root = gitRepo(files);
  seedPrevious(root, { lineage: lineage({ revision: head(root), ...lineageOverrides }) });
  return root;
}

describe("FR-UPD-01/02 mode decision", () => {
  test("no previous candidate → regenerate, no-previous; lineage written", () => {
    const root = gitRepo(files);
    const { report, runDir } = changeMap(root);
    expect(report).toEqual({
      mode: "regenerate",
      reason: "no-previous",
      previous: null,
      baseRevision: null,
      head: head(root),
      changeFile: null,
      mappingFile: null,
      touchedComponents: [],
      untouchedComponents: [],
      uncitedFiles: [],
    });
    // The run folder is still empty, so git status does not list `.archify/` yet.
    expect(readLineageFile(runDir)).toEqual(lineage({ revision: head(root), headCommit: commitOf(root) }));
    expect(readLineageFile(runDir).headCommit).toEqual({ subject: "init", committedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) });
    expect(existsSync(join(runDir, "change.md"))).toBe(false);
    expect(readFileSync(join(runDir, "lineage.json"), "utf8")).toMatch(/^\{\n {2}"mode"/);
  });

  test("a previous candidate of another scope is not used", () => {
    const root = gitRepo(files);
    seedPrevious(root, { run: "architecture-other-20000101-000000", lineage: lineage({ revision: head(root) }) });
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "no-previous", previous: null });
  });

  test("--regenerate → requested, previous still reported", () => {
    const root = updatableRepo();
    const { report, runDir } = changeMap(root, ["--regenerate"]);
    expect(report).toMatchObject({ mode: "regenerate", reason: "requested", previous: `.archify/${OLD_RUN}/candidate.sir` });
    expect(readLineageFile(runDir)).toMatchObject({ mode: "regenerate", reason: "requested", previousRun: OLD_RUN, updatesSinceRegeneration: 0 });
  });

  test("no git facts → no-git", () => {
    const root = tempDir();
    seedPrevious(root, { doc: candidate("a".repeat(40)) });
    const { report, runDir } = changeMap(root, [], envWithoutGit());
    expect(report).toMatchObject({ mode: "regenerate", reason: "no-git", head: null, previous: `.archify/${OLD_RUN}/candidate.sir` });
    expect(readLineageFile(runDir)).toMatchObject({ revision: null, baseCommit: null, headCommit: null, dirty: [], dirtyCount: 0 });
  });

  test("no lineage and no meta.repository.revision → no-base-revision", () => {
    const root = gitRepo(files);
    seedPrevious(root);
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "no-base-revision", baseRevision: null });
  });

  test("without lineage the candidate's meta.repository.revision is the base", () => {
    const root = gitRepo(files);
    seedPrevious(root, { doc: candidate(head(root)) });
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ mode: "update", reason: "update", baseRevision: head(root) });
    expect(readLineageFile(runDir).updatesSinceRegeneration).toBe(1);
  });

  test("a previous run with more than 200 dirty paths → dirty-baseline", () => {
    const root = updatableRepo({ dirtyCount: 201 });
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "dirty-baseline" });
  });

  test("a base missing from the object store → base-unreachable", () => {
    const root = updatableRepo({ revision: "0123456789abcdef0123456789abcdef01234567" });
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "base-unreachable" });
  });

  test("a base that is no longer an ancestor (history rewrite) → base-unreachable", () => {
    const root = gitRepo(files);
    put(root, "src/api.ts", "export const api = 2;\n");
    git(root, "commit", "-q", "-am", "b");
    const rewritten = head(root);
    git(root, "reset", "-q", "--hard", "HEAD~1");
    put(root, "src/db.ts", "export const db = 2;\n");
    git(root, "commit", "-q", "-am", "c");
    seedPrevious(root, { lineage: lineage({ revision: rewritten }) });
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "base-unreachable", baseRevision: rewritten });
  });

  test("5 updates since the last regeneration → scheduled", () => {
    const root = updatableRepo({ mode: "update", updatesSinceRegeneration: 5 });
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ mode: "regenerate", reason: "scheduled" });
    expect(readLineageFile(runDir).updatesSinceRegeneration).toBe(0);
  });

  test("4 updates since the last regeneration still update", () => {
    const root = updatableRepo({ mode: "update", updatesSinceRegeneration: 4 });
    const { report, runDir } = changeMap(root);
    expect(report.mode).toBe("update");
    expect(readLineageFile(runDir).updatesSinceRegeneration).toBe(5);
  });

  test("a change.md over 2 MiB → change-too-large, no change files", () => {
    const root = updatableRepo();
    put(root, "src/api.ts", "x".repeat(100) + "\n".repeat(1) + `${"y".repeat(99)}\n`.repeat(22_000));
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ mode: "regenerate", reason: "change-too-large", changeFile: null, touchedComponents: [] });
    expect(existsSync(join(runDir, "change.md"))).toBe(false);
    expect(readLineageFile(runDir)).toMatchObject({ mode: "regenerate", reason: "change-too-large" });
  });

  test.each([[[]], [["--run-folder"]], [["--bogus"]], [["--run-folder", "a", "--run-folder", "b"]]])("bad arguments %j exit 2", (args) => {
    const run = runScript("change-map", args, { cwd: tempDir() });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/usage/);
  });

  test.each([["not-a-run"], [".archify/architecture-demo-20000101-000000"], ["x/architecture-demo-20000101-000000"]])(
    "run folder %s that is malformed or missing exits 2",
    (folder) => {
      const root = tempDir();
      mkdirSync(join(root, "x/architecture-demo-20000101-000000"), { recursive: true });
      const run = runScript("change-map", ["--run-folder", folder], { cwd: root });
      expect(run.status).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toMatch(/^change-map\.mjs: /);
    },
  );
});

describe("FR-UPD-03 change files", () => {
  test("an unchanged tree → update with nothing touched and Sustain's own files left out", () => {
    const root = updatableRepo();
    const { report, runFolder, runDir } = changeMap(root);
    expect(report).toEqual({
      mode: "update",
      reason: "update",
      previous: `.archify/${OLD_RUN}/candidate.sir`,
      baseRevision: head(root),
      head: head(root),
      changeFile: `${runFolder}/change.md`,
      mappingFile: `${runFolder}/mapping.md`,
      touchedComponents: [],
      untouchedComponents: ["web", "api", "db"],
      uncitedFiles: [],
    });
    expect(readFileSync(join(runDir, "change.md"), "utf8")).toContain("No component's cited files changed.");
    expect(readFileSync(join(runDir, "mapping.md"), "utf8")).toContain("- `web` (Web)\n- `api` (API)\n- `db` (DB)");
  });

  test("a committed edit of a cited file touches its component and shows the hunk", () => {
    const root = updatableRepo();
    put(root, "src/api.ts", "export const api = 2;\n");
    git(root, "commit", "-q", "-am", "edit");
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ mode: "update", touchedComponents: ["api"], untouchedComponents: ["web", "db"], uncitedFiles: [] });
    const change = readFileSync(join(runDir, "change.md"), "utf8");
    expect(change).toContain("### `api` (API)\n\n```diff\ndiff --git a/src/api.ts b/src/api.ts");
    expect(change).toContain("-export const api = 1;\n+export const api = 2;");
    expect(readFileSync(join(runDir, "mapping.md"), "utf8")).toContain("- `api` (API)\n  - src/api.ts: @@ -1 +1 @@");
  });

  test("an untracked new file appears as uncited", () => {
    const root = updatableRepo();
    put(root, "src/queue.ts", "export const queue = 1;\n");
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ touchedComponents: [], uncitedFiles: ["src/queue.ts"] });
    expect(readFileSync(join(runDir, "change.md"), "utf8")).toContain("```\nA\tsrc/queue.ts\n```");
  });

  test("a staged-only edit appears", () => {
    const root = updatableRepo();
    put(root, "src/db.ts", "export const db = 'staged';\n");
    git(root, "add", "src/db.ts");
    const { report, runDir } = changeMap(root);
    expect(report.touchedComponents).toEqual(["db"]);
    expect(readFileSync(join(runDir, "change.md"), "utf8")).toContain("+export const db = 'staged';");
  });

  test("a deny-listed .env change appears by name with no content", () => {
    const root = gitRepo({ ...files, ".env": "TOKEN=first-secret\n" });
    seedPrevious(root, { lineage: lineage({ revision: head(root) }) });
    put(root, ".env", "TOKEN=second-secret\n");
    const { report, runDir } = changeMap(root);
    expect(report.uncitedFiles).toEqual([".env"]);
    const written = readFileSync(join(runDir, "change.md"), "utf8") + readFileSync(join(runDir, "mapping.md"), "utf8");
    expect(written).toContain("M\t.env");
    expect(written).not.toContain("secret");
  });

  test("a rename of a cited file touches its component", () => {
    const root = updatableRepo();
    git(root, "mv", "src/web.ts", "src/frontend.ts");
    git(root, "commit", "-q", "-m", "rename");
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ touchedComponents: ["web"], uncitedFiles: [] });
    const change = readFileSync(join(runDir, "change.md"), "utf8");
    expect(change).toContain("rename from src/web.ts\nrename to src/frontend.ts");
    expect(readFileSync(join(runDir, "mapping.md"), "utf8")).toContain("  - src/web.ts → src/frontend.ts\n");
  });

  test("a path that was uncommitted at the previous run counts as modified", () => {
    const root = updatableRepo({ dirty: ["src/db.ts", "notes.txt"], dirtyCount: 2 });
    const { report, runDir } = changeMap(root);
    expect(report).toMatchObject({ touchedComponents: ["db"], uncitedFiles: ["notes.txt"] });
    expect(readFileSync(join(runDir, "mapping.md"), "utf8")).toContain(
      "  - src/db.ts (uncommitted when the previous diagram was drawn; compare with the current file)",
    );
    expect(readFileSync(join(runDir, "change.md"), "utf8")).toContain("D\tnotes.txt");
  });
});

describe("FR-UPD-04 lineage", () => {
  test("regenerate → update → update counts 0, 1, 2 and links each run to the previous one", () => {
    const root = gitRepo(files);
    const accept = (runDir: string): void => writeFileSync(join(runDir, "candidate.sir"), JSON.stringify(candidate(), null, 2));

    const first = changeMap(root);
    expect(first.report.mode).toBe("regenerate");
    accept(first.runDir);
    const second = changeMap(root);
    accept(second.runDir);
    const third = changeMap(root);

    const firstName = first.runFolder.slice(".archify/".length);
    const secondName = second.runFolder.slice(".archify/".length);
    expect([first, second, third].map(({ runDir }) => readLineageFile(runDir).updatesSinceRegeneration)).toEqual([0, 1, 2]);
    expect(readLineageFile(second.runDir)).toMatchObject({ mode: "update", previousRun: firstName, baseRevision: head(root), revision: head(root) });
    expect(readLineageFile(third.runDir)).toMatchObject({ mode: "update", previousRun: secondName });
    expect(third.report.previous).toBe(`${second.runFolder}/candidate.sir`);
  });

  test("more than 200 dirty paths are capped in the lineage and force the next run to regenerate", () => {
    const root = gitRepo(files);
    writeFileSync(join(root, ".gitignore"), ".archify/\n");
    git(root, "add", ".gitignore");
    git(root, "commit", "-q", "-m", "ignore");
    for (let i = 0; i < 201; i += 1) put(root, `scratch/f${String(i).padStart(3, "0")}.txt`, "x\n");
    git(root, "add", "scratch");
    const first = changeMap(root);
    const recorded = readLineageFile(first.runDir);
    expect(recorded.dirtyCount).toBe(201);
    expect(recorded.dirty).toHaveLength(200);

    writeFileSync(join(first.runDir, "candidate.sir"), JSON.stringify(candidate(), null, 2));
    rmSync(join(root, "scratch"), { recursive: true, force: true });
    git(root, "add", "-A");
    expect(changeMap(root).report).toMatchObject({ mode: "regenerate", reason: "dirty-baseline" });
  });
});

describe("FR-CMP-01 commit details in the lineage", () => {
  test("update mode records the base and head commits", () => {
    const root = updatableRepo();
    const base = commitOf(root);
    put(root, "src/api.ts", "export const api = 2;\n");
    git(root, "commit", "-q", "-am", "Änderung: API 修正");
    const { runDir } = changeMap(root);
    const recorded = readLineageFile(runDir);
    expect(recorded.baseCommit).toEqual(base);
    expect(recorded.headCommit).toEqual(commitOf(root));
    expect(recorded.headCommit?.subject).toBe("Änderung: API 修正");
  });
});

describe("FR-CMP-02 changes.json", () => {
  test("an edit to a cited file lists the component and the file", () => {
    const root = updatableRepo();
    const base = head(root);
    put(root, "src/api.ts", "export const api = 2;\n");
    git(root, "commit", "-q", "-am", "edit");
    const { runDir } = changeMap(root);
    expect(readChangesFile(runDir)).toEqual({
      baseRevision: base,
      revision: head(root),
      touchedComponents: [{ id: "api", files: [{ status: "M", path: "src/api.ts" }] }],
      uncited: [],
    });
    expect(readFileSync(join(runDir, "changes.json"), "utf8")).toMatch(/^\{\n {2}"baseRevision"/);
  });

  test("a rename of a cited file lists R with oldPath", () => {
    const root = updatableRepo();
    git(root, "mv", "src/web.ts", "src/frontend.ts");
    git(root, "commit", "-q", "-m", "rename");
    const { runDir } = changeMap(root);
    expect(readChangesFile(runDir).touchedComponents).toEqual([{ id: "web", files: [{ status: "R", path: "src/frontend.ts", oldPath: "src/web.ts" }] }]);
  });

  test("an untracked file appears in uncited as A", () => {
    const root = updatableRepo();
    put(root, "src/queue.ts", "export const queue = 1;\n");
    const { runDir } = changeMap(root);
    expect(readChangesFile(runDir)).toMatchObject({ touchedComponents: [], uncited: [{ status: "A", path: "src/queue.ts" }] });
  });

  test("regenerate mode leaves no changes.json", () => {
    const root = updatableRepo();
    put(root, "src/api.ts", "export const api = 2;\n");
    const { report, runDir } = changeMap(root, ["--regenerate"]);
    expect(report.mode).toBe("regenerate");
    expect(existsSync(join(runDir, "changes.json"))).toBe(false);
  });
});
