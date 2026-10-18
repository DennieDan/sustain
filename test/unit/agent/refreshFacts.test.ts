// FRS-05: refresh-facts.mjs reports how a map compares with the code since it was made, and
// creates the refresh's run folder with a draft copied from the map. CST-03: it prints the refresh's
// estimate.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { skillEstimates } from "../../../src/model/estimate";
import { repoSize, sizeFacts } from "../../../src/model/repoSize";
import { git, gitRepo, put, runScript } from "../support/temp";

const SOURCE = ["import x from 'x';", "", "export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

/** A git repository with an accepted map of it, focused on "payments". Returns the base run folder name. */
function mappedRepo(): { root: string; base: string } {
  const root = gitRepo({ "src/a.ts": SOURCE, "src/b.ts": "notes\n", "lib/util.ts": "export {};\n" });
  const facts = runScript("repo-facts", ["--focus", "payments"], { cwd: root }).json();
  put(
    root,
    facts.draft,
    JSON.stringify({
      meta: { title: "Payments" },
      components: [
        { id: "api", type: "backend", label: "API", sources: [{ path: "src/a.ts", line: 3, end_line: 6 }] },
        { id: "docs", type: "external", label: "Docs", sources: [{ path: "src/b.ts" }] },
      ],
      connections: [{ id: "api-docs", from: "api", to: "docs" }],
    }),
  );
  expect(runScript("validate", [facts.draft], { cwd: root }).status).toBe(0);
  return { root, base: facts.runFolder.replace(".archify/", "") };
}

function changeTheCode(root: string): void {
  put(root, "src/a.ts", SOURCE.replace("save(body)", "store(body)"));
  put(root, "src/c.ts", "export const c = 1;\n");
  put(root, "packages/new/index.ts", "export {};\n");
}

describe("FRS-05 refresh-facts", () => {
  test("reports edited boxes, changed and uncovered files and new folders, and starts a refresh run", () => {
    const { root, base } = mappedRepo();
    changeTheCode(root);
    const run = runScript("refresh-facts", ["--from", base], { cwd: root });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const facts = run.json() as Record<string, any>;
    expect(facts["base"]).toMatchObject({ runFolder: `.archify/${base}`, revision: git(root, "rev-parse", "HEAD").trim(), fingerprints: true });
    expect(facts["boxes"]).toEqual(["api"]);
    expect(facts["stale"]).toEqual([{ component: "api", index: 0, path: "src/a.ts", state: "edited" }]);
    expect(facts["changes"]).toEqual([
      { path: "src/a.ts", added: 1, deleted: 1, covered: true },
      { path: "packages/new/index.ts", added: null, deleted: null, covered: false },
      { path: "src/c.ts", added: null, deleted: null, covered: false },
    ]);
    expect(facts["uncovered"]).toEqual(["packages/new/index.ts", "src/c.ts"]);
    expect(facts["newFolders"]).toEqual(["packages"]);

    expect(facts["runFolder"]).toMatch(/^\.archify\/architecture-payments-\d{8}-\d{6}(-\d+)?$/);
    expect(facts["runFolder"]).not.toBe(`.archify/${base}`);
    const record = JSON.parse(readFileSync(join(root, facts["runFolder"], "run.json"), "utf8"));
    expect(record).toMatchObject({ kind: "refresh", focus: "payments", base, paths: [], phase: "created" });

    const draft = JSON.parse(readFileSync(join(root, facts["draft"]), "utf8"));
    const candidate = JSON.parse(readFileSync(join(root, ".archify", base, "candidate.json"), "utf8"));
    expect(candidate.meta).toHaveProperty("output");
    expect(draft.meta).toEqual({ title: "Payments" });
    expect(draft.components).toEqual(candidate.components);
    expect(runScript("validate", [facts["draft"]], { cwd: root }).status).toBe(0);
  });

  test("CST-03 prints each agent's estimate for a refresh", () => {
    const { root, base } = mappedRepo();
    const facts = runScript("refresh-facts", ["--from", base], { cwd: root }).json() as Record<string, any>;
    expect(facts["estimate"]).toEqual(skillEstimates(sizeFacts(repoSize(root)), "refresh"));
  });

  test("--paths limits the report to its globs and is recorded", () => {
    const { root, base } = mappedRepo();
    changeTheCode(root);
    const facts = runScript("refresh-facts", ["--from", `.archify/${base}/`, "--paths", "src/c.*", "lib"], { cwd: root }).json() as Record<string, any>;
    expect(facts["paths"]).toEqual(["src/c.*", "lib"]);
    expect(facts["boxes"]).toEqual([]);
    expect(facts["uncovered"]).toEqual(["src/c.ts"]);
    expect(facts["newFolders"]).toEqual([]);
    expect(JSON.parse(readFileSync(join(root, facts["runFolder"], "run.json"), "utf8")).paths).toEqual(["src/c.*", "lib"]);
  });

  test("a map without fingerprints or git still starts a refresh, with nothing known", () => {
    const { root, base } = mappedRepo();
    put(root, `.archify/${base}/fingerprints.json`, "not json");
    const facts = runScript("refresh-facts", ["--from", base], { cwd: root }).json() as Record<string, any>;
    expect(facts["base"]).toMatchObject({ revision: null, fingerprints: false });
    expect([facts["boxes"], facts["changes"], facts["newFolders"]]).toEqual([[], [], []]);
  });

  test.each([
    [[], "usage"],
    [["--from"], "usage"],
    [["--from", "x", "--paths"], "usage"],
    [["--from", "../outside"], "names a run folder"],
    [["--from", "architecture-none-20261018-120000"], "cannot read"],
  ])("%j is refused with exit 2", (args, message) => {
    const { root } = mappedRepo();
    const run = runScript("refresh-facts", args, { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain(message);
  });
});
