// FR-VIEW-01 (Open Architecture) and FR-VIEW-04 (the `*.sir` custom editor) in a single-folder
// workspace.
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until, viewerTab, viewerTabs } from "../viewers";

const OLD = "architecture-api-20260101-090000";
const NEW = "architecture-api-20261010-120000";

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function diagram(title: string): string {
  return JSON.stringify({
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title, output: ".archify/x/x.html" },
    components: [
      { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 1 }] },
      { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts" }] },
    ],
    connections: [{ from: "web", to: "api", label: "HTTP" }],
  });
}

suite("FR-VIEW-01/04 Open Architecture and the viewer", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const dir of [".archify", "docs", ".agents", ".claude", "src"]) rmSync(join(root, dir), { recursive: true, force: true });
  });

  test("without candidates: info with Generate, which runs Generate Architecture", async () => {
    ui.answers.info.push("Generate");
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(ui.infos[0]!.message, "No architecture diagram yet.");
    assert.deepEqual(ui.infos[0]!.rest, ["Generate"]);
    assert.deepEqual(ui.inputBoxes, [{ prompt: "Focus (optional)" }], "Generate Architecture ran");
    assert.deepEqual(hook.viewers(), []);
  });

  test("opens the newest candidate in the active column when no editor is open", async () => {
    write(root, `.archify/${OLD}/candidate.sir`, diagram("Old"));
    const newest = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.deepEqual(hook.viewers(), [{ file: newest, baseline: null, active: true, title: "New" }]);
    const tab = await viewerTab(newest);
    assert.equal(tab.group.viewColumn, vscode.ViewColumn.One);
    assert.equal(tab.label, "candidate.sir");
    assert.equal(ui.errors.length, 0);
  });

  test("re-running reveals and reloads the same tab", async () => {
    const file = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    writeFileSync(file, diagram("Renamed"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => hook.viewers()[0]?.title === "Renamed", "the reloaded title");
    assert.equal(hook.viewers().length, 1);
    assert.equal(viewerTabs().length, 1);
  });

  test("opens beside an open editor", async () => {
    const file = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    const code = write(root, "src/web.ts", "export {};\n");
    await vscode.window.showTextDocument(vscode.Uri.file(code), { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal((await viewerTab(file)).group.viewColumn, vscode.ViewColumn.Two);
  });

  test("opening any .sir file shows it in the viewer, resolved against its workspace folder", async () => {
    const file = write(root, "docs/system.sir", diagram("Browsed"));
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(file));
    await viewerTab(file);
    assert.deepEqual(hook.viewers(), [{ file, baseline: null, active: true, title: "Browsed" }]);
  });

  test("a .sir file reopened in the text editor is JSON", async () => {
    const file = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(file), "default");
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === file, "the text editor");
    assert.equal(vscode.window.activeTextEditor!.document.languageId, "json");
  });

  test("an unreadable diagram shows the error and an empty-state viewer", async () => {
    const file = write(root, `.archify/${NEW}/candidate.sir`, "{ not json");
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(ui.errors.length, 1);
    assert.match(ui.errors[0]!.message, new RegExp(`^Can't show \`\\.archify/${NEW}/candidate\\.sir\`: invalid JSON`));
    assert.deepEqual(hook.viewers(), [{ file, baseline: null, active: true, title: undefined }]);
    await viewerTab(file);
  });

  test("a document without components is refused with the reason", async () => {
    write(root, `.archify/${NEW}/candidate.sir`, JSON.stringify({ meta: { title: "Empty" }, components: [] }));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(ui.errors[0]?.message, `Can't show \`.archify/${NEW}/candidate.sir\`: it has no components`);
  });

  test("closing the tab removes the viewer", async () => {
    write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(hook.viewers().length, 1);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.deepEqual(hook.viewers(), []);
  });
});
