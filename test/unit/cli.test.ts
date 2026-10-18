// RCH-03 and PRC-01's exit codes: every core CLI command against temporary repositories, run as
// the built dist/cli/sustain.mjs beside its skills.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { TEST_DIST } from "./support/buildScripts";
import { git, gitRepo, put, runScript, tempDir } from "./support/temp";

const CLI = join(TEST_DIST, "cli/sustain.mjs");
const HANDLER = ["export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

function cli(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): { status: number | null; stdout: string; json: () => any } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: options.cwd, encoding: "utf8", env: options.env ?? process.env });
  return { status: result.status, stdout: result.stdout, json: () => JSON.parse(result.stdout) };
}

/** A repository on `main` with a committed, accepted map; work continues on `feature`. */
function mappedRepo(): { root: string; run: string } {
  const root = gitRepo({ "src/api/handler.ts": HANDLER, "src/store/db.ts": "export const db = {};\n" });
  const facts = runScript("repo-facts", [], { cwd: root }).json();
  put(
    root,
    facts.draft,
    JSON.stringify({
      meta: { title: "Shop" },
      components: [
        { id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1, end_line: 4 }] },
        { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
      ],
    }),
  );
  expect(runScript("validate", [facts.draft], { cwd: root }).status).toBe(0);
  git(root, "add", ".");
  git(root, "commit", "-qm", "map");
  git(root, "checkout", "-qb", "feature");
  return { root, run: facts.runFolder.replace(".archify/", "") };
}

describe("RCH-03 install and verify-skills", () => {
  test("install --scope project writes every skill; verify-skills finds them intact, then a changed file", () => {
    const root = tempDir();
    const installed = cli(["install", "--scope", "project", "--root", root], { cwd: root });
    expect(installed.status).toBe(0);
    expect(installed.json()).toEqual({ status: "installed", base: root, skills: ["sustain-architecture", "sustain-bugfix", "sustain-refresh"] });
    expect(existsSync(join(root, ".claude/skills/sustain-refresh/SKILL.md"))).toBe(true);

    const intact = cli(["verify-skills", "--scope", "project"], { cwd: root });
    expect([intact.status, intact.json().status]).toEqual([0, "intact"]);
    writeFileSync(join(root, ".agents/skills/sustain-architecture/SKILL.md"), "changed");
    const changed = cli(["verify-skills", "--scope", "project"], { cwd: root });
    expect(changed.status).toBe(1);
    expect(changed.json().skills["sustain-architecture"]).toEqual({ intact: false, differing: 1, otherCopies: [] });
  });

  test("install defaults to the user's home, and missing skills do not verify", () => {
    const root = tempDir();
    const home = tempDir();
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    expect(cli(["verify-skills"], { cwd: root, env }).json().skills["sustain-architecture"]).toEqual({ intact: false, differing: null, otherCopies: [] });
    expect(cli(["install"], { cwd: root, env }).json().base).toBe(home);
    expect(existsSync(join(home, ".agents/skills/sustain-architecture/scripts/render-html.mjs"))).toBe(true);
    expect(cli(["verify-skills"], { cwd: root, env }).status).toBe(0);
  });
});

describe("RCH-03 map commands", () => {
  test("staleness reports each box against the code", () => {
    const { root, run } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    const result = cli(["staleness"], { cwd: root });
    expect(result.status).toBe(0);
    expect(result.json()).toMatchObject({ map: run, fingerprints: true, boxes: { api: "edited", store: "fresh" } });
  });

  test("changes marks boxes for a scope and refuses an unknown one", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("parse(req)", "parseJson(req)"));
    expect(cli(["changes", "--scope", "uncommitted"], { cwd: root }).json()).toMatchObject({ scope: "uncommitted", strong: ["api"], weak: [] });
    git(root, "commit", "-qam", "edit");
    expect(cli(["changes", "--scope", "range", "--range", "main..HEAD"], { cwd: root }).json()).toMatchObject({ strong: ["api"] });
    expect(cli(["changes", "--scope", "everything"], { cwd: root }).status).toBe(2);
  });

  test("export-page writes the map's page, without the root when shared", () => {
    const { root, run } = mappedRepo();
    const result = cli(["export-page", "--share"], { cwd: root });
    const { status, page } = result.json() as { status: string; page: string };
    expect(status).toBe("written");
    expect(page).toMatch(new RegExp(`^\\.archify/${run}/[a-z0-9-]+\\.html$`));
    const html = readFileSync(join(root, page), "utf8");
    expect(html).toContain('"root":null');
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  test("preflight lists the checks and fails while one fails", () => {
    const root = tempDir();
    const result = cli(["preflight"], { cwd: root, env: { ...process.env, PATH: dirname(process.execPath), HOME: tempDir() } });
    expect(result.status).toBe(1);
    expect(result.json().checks.map((check: { id: string; ok: boolean }) => [check.id, check.ok])).toEqual([
      ["node", true],
      ["claude", false],
      ["codex", false],
      ["devin", false],
      ["skills", false],
      ["git", false],
    ]);
  });
});

describe("PRC-01 RCH-03 check and exit codes", () => {
  test("check passes with exit 0, fails under --fail-on with exit 1, and prints markdown on request", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    git(root, "commit", "-qam", "edit");
    const pass = cli(["check", "--base", "main", "--head", "HEAD"], { cwd: root });
    expect([pass.status, pass.json().result, pass.json().stale.map((box: { id: string }) => box.id)]).toEqual([0, "pass", ["api"]]);
    const fail = cli(["check", "--base", "main", "--head", "HEAD", "--fail-on", "stale,new-box"], { cwd: root });
    expect([fail.status, fail.json().result]).toEqual([1, "fail"]);
    const markdown = cli(["check", "--base", "main", "--format", "markdown"], { cwd: root });
    expect(markdown.stdout.startsWith("### Sustain check: pass")).toBe(true);
  });

  test.each([
    [["check"], "check needs --base"],
    [["check", "--base", "main", "--fail-on", "everything"], "--fail-on takes"],
    [["check", "--base", "nope"], "No common commit"],
    [["unknown"], "usage"],
    [["staleness", "--format", "yaml"], "--format is json or markdown"],
    [["staleness", "stray"], "unexpected argument"],
  ])("%j is a usage error with exit 2", (args, message) => {
    const { root } = mappedRepo();
    const result = cli(args, { cwd: root });
    expect(result.status).toBe(2);
    expect(result.json().message).toContain(message);
  });

  test("a repository without a map is told how to make one", () => {
    const root = gitRepo({ "a.ts": "1\n" });
    expect(cli(["staleness"], { cwd: root }).json().message).toContain("No map");
  });
});
