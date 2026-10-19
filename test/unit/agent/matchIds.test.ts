// FR-UPD-09: match-ids.mjs rewrites a regenerated draft in place with the previous diagram's IDs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchIds } from "../../../src/model/matchIds";
import { stringifyDocument } from "../../../src/model/types";
import { put, runScript, tempDir } from "../support/temp";

const comp = (id: string, files: string[]) => ({ id, type: "backend", label: id, sources: files.map((path) => ({ path, line: 1, end_line: 2 })) });

const previous = {
  components: [comp("ui", ["Ui.java"]), comp("logic", ["Parser.java"])],
  connections: [{ id: "c1", from: "ui", to: "logic", label: "input" }],
};
const draft = {
  meta: { title: "T" },
  components: [comp("view", ["Ui.java"]), comp("engine", ["Parser.java"]), comp("ui", ["New.java"])],
  connections: [{ id: "x1", from: "view", to: "engine", label: "input" }],
};

describe("match-ids.mjs", () => {
  it("rewrites the draft in place and prints the maps", () => {
    const root = tempDir();
    const draftPath = put(root, ".archify/run/draft.json", JSON.stringify(draft));
    put(root, ".archify/prev/candidate.json", JSON.stringify(previous));
    const run = runScript("match-ids", [".archify/run/draft.json", "--previous", ".archify/prev/candidate.json"], { cwd: root });
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    const expected = matchIds(previous, draft);
    expect(readFileSync(draftPath, "utf8")).toBe(stringifyDocument(expected.diagram));
    expect(run.stdout).toBe(`${JSON.stringify({ componentMap: expected.componentMap, connectionMap: expected.connectionMap, renamed: expected.renamed }, null, 2)}\n`);
    expect(run.json()).toEqual({
      componentMap: { view: "ui", engine: "logic", ui: "ui-n1" },
      connectionMap: { x1: "c1" },
      renamed: { ui: "ui-n1" },
    });
  });

  it("leaves an invalid-JSON draft untouched", () => {
    const root = tempDir();
    const draftPath = put(root, "draft.json", "{ not json");
    put(root, "candidate.json", JSON.stringify(previous));
    const run = runScript("match-ids", ["draft.json", "--previous", "candidate.json"], { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^match-ids\.mjs: /);
    expect(readFileSync(draftPath, "utf8")).toBe("{ not json");
  });

  it.each([
    [[]],
    [["draft.json"]],
    [["draft.json", "candidate.json"]],
    [["--previous", "candidate.json", "draft.json"]],
    [["draft.json", "--previous", "candidate.json", "extra"]],
  ])("rejects argv %j", (args) => {
    const root = tempDir();
    put(root, "draft.json", JSON.stringify(draft));
    put(root, "candidate.json", JSON.stringify(previous));
    const run = runScript("match-ids", args, { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/^match-ids\.mjs: usage/);
  });

  it("rejects a draft without a components array and a non-object previous", () => {
    const root = tempDir();
    put(root, "bad.json", JSON.stringify({ components: {} }));
    put(root, "draft.json", JSON.stringify(draft));
    put(root, "list.json", "[]");
    put(root, "candidate.json", JSON.stringify(previous));
    expect(runScript("match-ids", ["bad.json", "--previous", "candidate.json"], { cwd: root }).status).toBe(2);
    expect(runScript("match-ids", ["draft.json", "--previous", "list.json"], { cwd: root }).status).toBe(2);
  });

  it("fails with exit 2 when the previous candidate is missing", () => {
    const root = tempDir();
    const text = JSON.stringify(draft);
    const draftPath = put(root, "draft.json", text);
    const run = runScript("match-ids", ["draft.json", "--previous", "missing.json"], { cwd: root });
    expect(run.status).toBe(2);
    expect(run.stdout).toBe("");
    expect(run.stderr).toMatch(/cannot read previous candidate/);
    expect(readFileSync(draftPath, "utf8")).toBe(text);
  });
});
