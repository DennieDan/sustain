// PRC-01: the delta report on temporary git repositories, one per category, with the config,
// ownership, the main map and the markdown.
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { mainMap, runCheck } from "../../../src/model/check";
import { readConfig, withIgnored } from "../../../src/model/config";
import { deltaMarkdown, deltaMermaid, escapeMarkdown } from "../../../src/model/deltaMarkdown";
import { isSourceFile, isTestFile } from "../../../src/model/delta";
import { Ownership } from "../../../src/model/ownership";
import { git, gitRepo, put, runScript } from "../support/temp";

const HANDLER = ["export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");
const lines = (count: number): string => Array.from({ length: count }, (_, i) => `export const v${i} = ${i};`).join("\n") + "\n";

/**
 * A repository on `main` with an accepted, committed map of two boxes: `api` citing
 * src/api/handler.ts lines 1-4 and `store` citing src/store/db.ts. Work continues on `feature`.
 */
function mappedRepo(focus = ""): { root: string; run: string } {
  const root = gitRepo({ "src/api/handler.ts": HANDLER, "src/api/routes.ts": "export const routes = [];\n", "src/store/db.ts": "export const db = {};\n", "lib/util.ts": "export {};\n" });
  const facts = runScript("repo-facts", focus === "" ? [] : ["--focus", focus], { cwd: root }).json();
  put(
    root,
    facts.draft,
    JSON.stringify({
      meta: { title: "Shop" },
      components: [
        { id: "api", type: "backend", label: "API <b>|</b>", sources: [{ path: "src/api/handler.ts", line: 1, end_line: 4 }] },
        { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
      ],
      connections: [{ from: "api", to: "store", label: "saves" }],
    }),
  );
  expect(runScript("validate", [facts.draft], { cwd: root }).status).toBe(0);
  git(root, "add", ".");
  git(root, "commit", "-qm", "map");
  git(root, "checkout", "-qb", "feature");
  return { root, run: facts.runFolder.replace(".archify/", "") };
}

function commit(root: string, message: string): void {
  git(root, "add", "-A");
  git(root, "commit", "-qm", message);
}

function check(root: string, options: { head?: string; failOn?: ("stale" | "new-box")[] } = { head: "HEAD" }) {
  const outcome = runCheck({ root, base: "main", ...options });
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.report;
}

describe("PRC-01 categories", () => {
  test("touched: a changed cited line is strong, another line in a cited file weak", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("parse(req)", "parseJson(req)"));
    put(root, "src/store/db.ts", "export const db = {};\nexport const extra = 1;\n");
    commit(root, "change");
    const report = check(root);
    expect(report.touched).toEqual({ strong: [{ id: "api", label: "API <b>|</b>" }], weak: [{ id: "store", label: "Store" }] });
  });

  test("stale: a box whose cited code changed at the head", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    commit(root, "edit");
    expect(check(root).stale).toEqual([{ id: "api", label: "API <b>|</b>", state: "edited" }]);
  });

  test("uncovered: a changed source file no box owns, minus ignore, and never a non-source file", () => {
    const { root } = mappedRepo();
    put(root, "lib/util.ts", "export const util = 1;\n");
    put(root, "lib/skip.ts", "export {};\n");
    put(root, "README.md", "# docs\n");
    put(root, "src/api/new.ts", "export {};\n");
    writeFileSync(join(root, "sustain.config.json"), JSON.stringify({ ignore: ["lib/skip.ts"] }));
    commit(root, "spread");
    // src/api/new.ts belongs to api, whose cited file sits in the same folder.
    expect(check(root).uncovered).toEqual(["lib/util.ts"]);
  });

  test("candidates: a new folder with 3 source files, and an unowned folder gaining 200 lines", () => {
    const { root } = mappedRepo();
    for (const name of ["a", "b", "c"]) put(root, `src/payments/${name}.ts`, `export const ${name} = 1;\n`);
    put(root, "src/payments/sub/d.ts", "export const d = 1;\n");
    put(root, "src/payments/a.test.ts", lines(500));
    put(root, "lib/big.ts", lines(210));
    put(root, "tools/one.ts", lines(20));
    commit(root, "grow");
    const report = check(root);
    expect(report.candidates.map((candidate) => [candidate.dir, candidate.label, candidate.files.length, candidate.lines])).toEqual([
      ["lib", "lib", 1, 210],
      ["src/payments", "payments", 5, 4],
    ]);
  });

  test("gone: a box whose every cited file was deleted", () => {
    const { root } = mappedRepo();
    rmSync(join(root, "src/store/db.ts"));
    commit(root, "delete");
    const report = check(root);
    expect(report.gone).toEqual([{ id: "store", label: "Store" }]);
    expect(report.stale).toEqual([]);
  });

  test("without --head the working tree counts, untracked files included", () => {
    const { root } = mappedRepo();
    put(root, "lib/fresh.ts", lines(5));
    const report = check(root, {});
    expect(report.head).toBeNull();
    expect(report.uncovered).toEqual(["lib/fresh.ts"]);
  });

  test("--fail-on fails on stale or gone boxes and on candidates, and passes otherwise", () => {
    const { root } = mappedRepo();
    rmSync(join(root, "src/store/db.ts"));
    commit(root, "delete");
    expect(check(root, { head: "HEAD", failOn: [] }).result).toBe("pass");
    expect(check(root, { head: "HEAD", failOn: ["stale"] })).toMatchObject({ result: "fail", reasons: ["1 stale or gone box(es)"] });
    expect(check(root, { head: "HEAD", failOn: ["new-box"] }).result).toBe("pass");
  });
});

describe("PRC-01 the map, ownership and config", () => {
  test("the main map is the newest accepted run with an empty focus; --map and the config override it", () => {
    const { root, run } = mappedRepo();
    const focused = runScript("repo-facts", ["--focus", "payments"], { cwd: root }).json();
    put(root, focused.draft, JSON.stringify({ meta: { title: "Payments" }, components: [{ id: "p", type: "backend", label: "P", sources: [{ path: "lib/util.ts" }] }] }));
    expect(runScript("validate", [focused.draft], { cwd: root }).status).toBe(0);
    expect(mainMap(root)).toBe(run);
    const other = focused.runFolder.replace(".archify/", "");
    expect(runCheck({ root, base: "main", map: other })).toMatchObject({ ok: true, report: { map: other } });
    writeFileSync(join(root, "sustain.config.json"), JSON.stringify({ map: other }));
    expect(runCheck({ root, base: "main" })).toMatchObject({ ok: true, report: { map: other } });
  });

  test("no map, a bad config or a bad revision is a refusal with a reason", () => {
    const root = gitRepo({ "a.ts": "1\n" });
    expect(runCheck({ root, base: "main" })).toMatchObject({ ok: false, reason: expect.stringContaining("No map") });
    const { root: mapped } = mappedRepo();
    writeFileSync(join(mapped, "sustain.config.json"), JSON.stringify({ unknown: 1 }));
    expect(runCheck({ root: mapped, base: "main" })).toMatchObject({ ok: false, reason: 'sustain.config.json: unknown key "unknown"' });
    rmSync(join(mapped, "sustain.config.json"));
    expect(runCheck({ root: mapped, base: "--output=x" })).toMatchObject({ ok: false });
  });

  test("a file belongs to the boxes citing it, else to those citing files in its nearest folder", () => {
    const ownership = new Ownership([
      { id: "api", sources: [{ path: "src/api/handler.ts" }] },
      { id: "deep", sources: [{ path: "src/api/v2/x.ts" }] },
      { id: "root", sources: [{ path: "main.go" }] },
    ]);
    expect(ownership.owners("src/api/handler.ts")).toEqual(["api"]);
    expect(ownership.owners("src/api/other.ts")).toEqual(["api"]);
    expect(ownership.owners("src/api/v2/y.ts")).toEqual(["deep"]);
    expect(ownership.owners("src/api/v2/sub/z.ts")).toEqual(["deep"]);
    expect(ownership.owners("src/web/page.ts")).toEqual(["root"]);
    expect(new Ownership([{ id: "api", sources: [{ path: "src/api/handler.ts" }] }]).owners("lib/x.ts")).toEqual([]);
  });

  test("the config schema accepts its keys and refuses others", () => {
    expect(readConfig({ map: "architecture-a-20261018-120000", ignore: ["docs/**"], check: { failOn: ["stale", "new-box"] }, rules: [] })).toMatchObject({ ok: true });
    expect(readConfig({ map: "../x", ignore: "docs", check: { failOn: ["everything"], other: 1 }, rules: {}, extra: true })).toEqual({
      ok: false,
      errors: ['unknown key "extra"', '"map" must name a run folder in .archify/', '"ignore" must be a list of globs', '"rules" must be a list', 'unknown key "check.other"', '"check.failOn" may list only stale, new-box'],
    });
    expect(withIgnored({ ignore: ["a/**"] }, "src/payments")).toEqual({ ignore: ["a/**", "src/payments/**"] });
    expect(withIgnored({ ignore: ["src/payments/**"] }, "src/payments")).toEqual({ ignore: ["src/payments/**"] });
  });

  test("source and test files are told apart by name", () => {
    expect(["a.ts", "x/y.py", "Main.java"].every(isSourceFile)).toBe(true);
    expect(["README.md", "a.json", ".archify/x/candidate.json", "Makefile"].some(isSourceFile)).toBe(false);
    expect(["a.test.ts", "tests/x.py", "pkg/x_test.go", "test_x.py", "src/__tests__/a.js"].every(isTestFile)).toBe(true);
    expect(isTestFile("src/contest.ts")).toBe(false);
  });
});

describe("PRC-01 markdown", () => {
  test("the report renders as markdown with every label escaped", async () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    for (const name of ["a", "b", "c"]) put(root, `src/payments/${name}.ts`, `export const ${name} = 1;\n`);
    rmSync(join(root, "src/store/db.ts"));
    put(root, "lib/util.ts", "export const util = 2;\n");
    commit(root, "all");
    const report = check(root);
    const markdown = deltaMarkdown(report, { ...report, mergeBase: "0123456789abcdef" });
    expect(markdown).not.toContain("<b>");
    await expect(markdown.replace(/architecture-\d{8}-\d{6}|architecture-[a-z0-9-]+-\d{8}-\d{6}(-\d+)?/g, "<run>")).toMatchFileSnapshot("__snapshots__/delta.md");
  });

  test("escaping covers HTML and markdown characters", () => {
    expect(escapeMarkdown("<img src=x> | *bold* [link](x)")).toBe("&lt;img src=x&gt; &#124; \\*bold\\* \\[link\\]\\(x\\)");
  });

  test("the Mermaid chart shows touched boxes, their neighbours and dashed candidates under generated ids", () => {
    const report = {
      touched: { strong: [{ id: "api", label: "API" }], weak: [] },
      stale: [],
      uncovered: [],
      gone: [],
      candidates: [{ dir: "src/pay", files: [], lines: 0, label: 'pay"]; click n0 "javascript:x' }],
    };
    const chart = deltaMermaid(report, {
      components: [
        { id: "api", label: 'A"PI<script>' },
        { id: "store", label: "Store" },
        { id: "far", label: "Far" },
      ],
      connections: [
        { from: "api", to: "store" },
        { from: "store", to: "far" },
      ],
    })!;
    expect(chart).toBe(
      [
        "```mermaid",
        "flowchart LR",
        '  n0["A#quot;PI#lt;script#gt;"]:::strong',
        '  n1["Store"]',
        "  n0 --> n1",
        '  c0["pay#quot;]; click n0 #quot;javascript:x (new)"]:::candidate',
        "  classDef strong stroke-width:3px",
        "  classDef weak stroke-dasharray:3 3",
        "  classDef candidate stroke-dasharray:6 4,fill:none",
        "```",
      ].join("\n"),
    );
    expect(deltaMermaid({ ...report, touched: { strong: [], weak: [] }, candidates: [] }, { components: [], connections: [] })).toBeNull();
  });
});
