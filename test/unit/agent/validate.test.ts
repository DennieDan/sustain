// FR-VAL-01..06 against the built validate.mjs, run with `node` as a child process.
import { chmodSync, readdirSync, readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { envWithoutGit, git, put, runScript, tempDir } from "../support/temp";

const RUN = "architecture-demo-api-20261011-120000";
const DRAFT = `.archify/${RUN}/draft.json`;

type Json = Record<string, unknown>;

function draftDoc(): Json & { meta: Json; components: Json[] } {
  return {
    meta: { title: "Demo", subtitle: "Sub", legend: { mode: "auto" } },
    components: [
      { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 1, end_line: 3 }] },
      { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts", line: 2, label: "handler" }] },
    ],
    connections: [{ id: "web-api", from: "web", to: "api", label: "HTTP" }],
    boundaries: [{ kind: "region", label: "App", wraps: ["web", "api"] }],
    cards: [{ dot: "violet", title: "Note", items: ["kept"] }],
  };
}

/** A repo (optionally a git repo) with two source files and `draft` written as the agent would. */
function setup(draft: unknown, options: { rawDraft?: string; root?: string } = {}): { root: string; draftPath: string; draftText: string } {
  const root = options.root ?? tempDir();
  put(root, "src/web.ts", "a\nb\nc\n");
  put(root, "src/api.ts", "1\n2\n");
  const draftText = options.rawDraft ?? JSON.stringify(draft, null, 2);
  const draftPath = put(root, DRAFT, draftText);
  return { root, draftPath, draftText };
}

function runFiles(root: string): string[] {
  return readdirSync(join(root, ".archify", RUN)).sort();
}

function candidate(root: string): Json & { meta: Json; components: Json[]; connections: Json[]; boundaries: Json[] } {
  return JSON.parse(readFileSync(join(root, ".archify", RUN, "candidate.json"), "utf8"));
}

describe("FR-VAL-01 CLI exit paths", () => {
  test("accepted: exit 0, one JSON object, candidate path, no hint", () => {
    const { root } = setup(draftDoc());
    const run = runScript("validate", [DRAFT], { cwd: root, env: envWithoutGit() });
    expect(run.status).toBe(0);
    expect(run.stderr).toBe("");
    expect(run.json()).toEqual({ status: "accepted", candidate: `.archify/${RUN}/candidate.json`, errors: [], warnings: [] });
  });

  test("rejected: exit 1, errors with pointers, the hint, no candidate", () => {
    const doc = draftDoc();
    doc.components[1]!["type"] = "nope";
    const { root } = setup(doc);
    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(1);
    const report = run.json();
    expect(report.status).toBe("rejected");
    expect(report.candidate).toBeUndefined();
    expect(report.hint).toBe("Fix exactly these errors and run the validator again.");
    expect(report.errors.map((error) => error.pointer)).toEqual(["/components/1/type"]);
    expect(report.errors[0]!.message).toMatch(/^Schema: /);
  });

  test("SAF-03 a secret-shaped string rejects the draft at its pointer", () => {
    const doc = draftDoc();
    doc.components[0]!["sublabel"] = "key AKIAIOSFODNN7EXAMPLE";
    const { root } = setup(doc);
    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json().errors).toEqual([{ pointer: "/components/0/sublabel", message: "SecretLike: looks like a secret (AWS access key). Remove it from the diagram." }]);
  });

  test("SAF-05 .archify linked outside the root is an I/O error and writes no candidate there", () => {
    const root = tempDir();
    const outside = tempDir();
    symlinkSync(outside, join(root, ".archify"), process.platform === "win32" ? "junction" : "dir");
    setup(draftDoc(), { root });
    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/outside/);
    expect(readdirSync(join(outside, RUN))).toEqual(["draft.json"]);
  });

  test("CST-04 an absolute draft path works from any cwd", () => {
    const { root, draftPath } = setup(draftDoc());
    const run = runScript("validate", [draftPath], { cwd: tempDir() });
    expect(run.status).toBe(0);
    expect(runFiles(root)).toEqual(["candidate.json", "run.json"]);
  });

  test("malformed JSON is a rejection at pointer \"\"", () => {
    const { root, draftText } = setup(null, { rawDraft: '{ "meta": ' });
    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json().errors).toEqual([{ pointer: "", message: expect.stringMatching(/^Json: draft\.json is not valid JSON/) }]);
    expect(readFileSync(join(root, DRAFT), "utf8")).toBe(draftText);
  });

  test.each([
    ["no arguments", [] as string[]],
    ["two arguments", [DRAFT, DRAFT]],
    ["a path that is not draft.json", [`.archify/${RUN}/candidate.json`]],
    ["a run folder with a non-run name", [".archify/hand-made/draft.json"]],
    ["a missing draft (I/O error)", [`.archify/${RUN.replace("api", "web")}/draft.json`]],
  ])("usage or I/O error (%s): exit 2, message on stderr, nothing on stdout", (_case, args) => {
    const { root } = setup(draftDoc());
    put(root, ".archify/hand-made/draft.json", "{}");
    const run = runScript("validate", args, { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^validate\.mjs: /);
  });

  test("CST-04 run.json counts validator runs and records the outcome", () => {
    const doc = draftDoc();
    doc.components[1]!["type"] = "nope";
    const { root } = setup(doc);
    const runJson = () => JSON.parse(readFileSync(join(root, ".archify", RUN, "run.json"), "utf8"));
    expect(runScript("validate", [DRAFT], { cwd: root }).status).toBe(1);
    expect(runJson()).toMatchObject({ phase: "rejected", attempts: 1 });
    setup(draftDoc(), { root });
    expect(runScript("validate", [DRAFT], { cwd: root }).status).toBe(0);
    expect(runJson()).toMatchObject({ phase: "accepted", attempts: 2 });
    expect(Date.parse(runJson().finishedAt)).not.toBeNaN();
  });

  test("CST-04 a read-only run folder is an I/O error: exit 2 and the draft stays", () => {
    const { root, draftText } = setup(draftDoc());
    const dir = join(root, ".archify", RUN);
    chmodSync(dir, 0o555);
    try {
      const run = runScript("validate", [DRAFT], { cwd: root });
      expect(run.status).toBe(2);
      expect(run.stdout).toBe("");
      expect(run.stderr).toMatch(/cannot write run\.json/);
    } finally {
      chmodSync(dir, 0o755);
    }
    expect(runFiles(root)).toEqual(["draft.json"]);
    expect(readFileSync(join(root, DRAFT), "utf8")).toBe(draftText);
  });

  test("at most 50 errors are listed, then a count of the rest", () => {
    const doc = draftDoc();
    doc.components = Array.from({ length: 60 }, (_, i) => ({ id: `c${i}`, type: "backend", label: `C${i}`, sources: [{ path: `missing/${i}.ts` }] }));
    doc.connections = [];
    doc.boundaries = [];
    const { root } = setup(doc);
    const report = runScript("validate", [DRAFT], { cwd: root }).json();
    expect(report.errors).toHaveLength(51);
    expect(report.errors[49]!.pointer).toBe("/components/49/sources/0/path");
    expect(report.errors[50]).toEqual({ pointer: "", message: "10 more errors not shown" });
  });
});

describe("FR-VAL-02 app-owned fields", () => {
  test("every removable field is stripped with a warning and the draft is still accepted", () => {
    const doc = draftDoc();
    doc["layout"] = { mode: "grid" };
    Object.assign(doc.meta, {
      viewBox: [800, 600],
      views: [],
      animation: "trace",
      translations: {},
      visual_preset: "classic",
      engineering_profile: "deployment-ownership",
      repository: { url: "https://example.com/x.git", revision: "0".repeat(40) },
    });
    Object.assign(doc.components[0]!, { pos: [1, 2], size: [100, 50], row: 0, col: 1, icon: "clock", brand: "rust" });
    const connection = (doc["connections"] as Json[])[0]!;
    for (const key of ["fromSide", "toSide", "route", "via", "labelAt", "labelDx", "labelDy", "labelSegment", "width"]) connection[key] = null;
    (doc["boundaries"] as Json[])[0]!["pad"] = 10;
    const { root } = setup(doc);

    const run = runScript("validate", [DRAFT], { cwd: root, env: envWithoutGit() });
    expect(run.status).toBe(0);
    const pointers = run.json().warnings.map((warning) => warning.pointer);
    expect(pointers.sort()).toEqual(
      [
        "/layout",
        ...["viewBox", "views", "animation", "translations", "visual_preset", "engineering_profile", "repository"].map((key) => `/meta/${key}`),
        ...["pos", "size", "row", "col", "icon", "brand"].map((key) => `/components/0/${key}`),
        ...["fromSide", "toSide", "route", "via", "labelAt", "labelDx", "labelDy", "labelSegment", "width"].map((key) => `/connections/0/${key}`),
        "/boundaries/0/pad",
      ].sort(),
    );
    expect(new Set(run.json().warnings.map((warning) => warning.message))).toEqual(new Set(["Removed app-owned field"]));

    const out = candidate(root);
    expect(out["layout"]).toBeUndefined();
    expect(Object.keys(out.meta).sort()).toEqual(["legend", "locale", "output", "quality_profile", "subtitle", "title"]);
    expect(Object.keys(out.components[0]!).sort()).toEqual(["id", "label", "sources", "type"]);
    expect(Object.keys(out.connections[0]!).sort()).toEqual(["from", "id", "label", "to"]);
    expect(Object.keys(out.boundaries[0]!).sort()).toEqual(["kind", "label", "wraps"]);
  });

  test("root and meta constants are set over agent values; unknown fields survive", () => {
    const doc = draftDoc();
    Object.assign(doc, { schema_version: 7, diagram_type: "workflow" });
    Object.assign(doc.meta, { locale: "fr", quality_profile: "standard", output: "../../etc/x.html" });
    const { root } = setup(doc);
    expect(runScript("validate", [DRAFT], { cwd: root, env: envWithoutGit() }).status).toBe(0);
    const out = candidate(root);
    expect(Object.keys(out).slice(0, 2)).toEqual(["schema_version", "diagram_type"]);
    expect(out["schema_version"]).toBe(1);
    expect(out["diagram_type"]).toBe("architecture");
    expect(out.meta).toMatchObject({ locale: "en", quality_profile: "showcase", output: `.archify/${RUN}/demo-api.html`, legend: { mode: "auto" } });
    expect(out["cards"]).toEqual(draftDoc()["cards"]);
  });

  test("meta.repository comes from git facts and overrides the agent's", () => {
    const root = tempDir();
    put(root, "src/web.ts", "a\nb\nc\n");
    put(root, "src/api.ts", "1\n2\n");
    git(root, "init", "-q");
    git(root, "add", ".");
    git(root, "commit", "-q", "-m", "init");
    git(root, "remote", "add", "origin", "https://user:token@github.com/acme/demo.git");
    const head = git(root, "rev-parse", "HEAD").trim();
    const doc = draftDoc();
    doc.meta["repository"] = { url: "https://example.com/wrong.git", revision: "f".repeat(40) };
    setup(doc, { root });

    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(0);
    expect(run.json().warnings).toEqual([]);
    expect(candidate(root).meta["repository"]).toEqual({ url: "https://github.com/acme/demo.git", revision: head, provider: "github" });
  });

  test("without git an agent-supplied meta.repository is removed with a warning", () => {
    const doc = draftDoc();
    doc.meta["repository"] = { url: "https://example.com/x.git", revision: "0".repeat(40) };
    const { root } = setup(doc);
    const run = runScript("validate", [DRAFT], { cwd: root, env: envWithoutGit() });
    expect(run.json().warnings).toEqual([{ pointer: "/meta/repository", message: "Removed app-owned field" }]);
    expect(candidate(root).meta["repository"]).toBeUndefined();
  });
});

describe("FR-VAL-03..05 checks through the CLI", () => {
  test("schema errors stop before semantic and citation checks", () => {
    const doc = draftDoc();
    doc.components[0]!["colour"] = "red";
    doc.components[1]!["sources"] = [{ path: "src/missing.ts" }];
    (doc["connections"] as Json[])[0]!["to"] = "ghost";
    const { root } = setup(doc);
    const report = runScript("validate", [DRAFT], { cwd: root }).json();
    expect(report.errors.map((error) => error.pointer)).toEqual(["/components/0/colour"]);
  });

  test("semantic and citation errors are reported together", () => {
    const doc = draftDoc();
    doc.components[1]!["sources"] = [{ path: "src/api.ts", line: 9 }];
    (doc["connections"] as Json[])[0]!["to"] = "ghost";
    const { root } = setup(doc);
    const report = runScript("validate", [DRAFT], { cwd: root }).json();
    expect(report.errors).toEqual([
      { pointer: "/connections/0/to", message: "UnknownReference: Connection `to` names unknown component `ghost`" },
      { pointer: "/components/1/sources/0/line", message: "BrokenCitation: Cited line 9 outside the file: src/api.ts has 2 lines" },
    ]);
  });

  test("a symlink pointing outside the root is a broken citation", () => {
    const base = tempDir();
    put(base, "outside/secret.ts", "s\n");
    const root = join(base, "repo");
    const doc = draftDoc();
    doc.components[1]!["sources"] = [{ path: "src/link.ts" }];
    setup(doc, { root });
    symlinkSync(join(base, "outside/secret.ts"), join(root, "src/link.ts"));
    const report = runScript("validate", [DRAFT], { cwd: root }).json();
    expect(report.errors).toEqual([
      { pointer: "/components/1/sources/0/path", message: "BrokenCitation: src/link.ts resolves outside the repository root" },
    ]);
  });
});

describe("FR-VAL-06 publish", () => {
  test("CST-04 an accepted run leaves candidate.json and run.json, the candidate written as 2-space JSON with a trailing newline", () => {
    const { root } = setup(draftDoc());
    expect(runScript("validate", [DRAFT], { cwd: root, env: envWithoutGit() }).status).toBe(0);
    expect(runFiles(root)).toEqual(["candidate.json", "run.json"]);
    const text = readFileSync(join(root, ".archify", RUN, "candidate.json"), "utf8");
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
  });

  test("CST-04 a rejected run leaves draft.json byte-identical and run.json", () => {
    const doc = draftDoc();
    doc.components[0]!["sources"] = [{ path: ".env" }];
    const { root, draftText } = setup(doc);
    const run = runScript("validate", [DRAFT], { cwd: root });
    expect(run.status).toBe(1);
    expect(run.json().errors[0]!.message).toMatch(/^DeniedCitation: /);
    expect(runFiles(root)).toEqual(["draft.json", "run.json"]);
    expect(readFileSync(join(root, DRAFT), "utf8")).toBe(draftText);
  });
});
