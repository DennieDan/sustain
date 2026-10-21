// FR-WAT-01: candidates created, modified or deleted on disk reach the viewers (FR-TEST-01 test
// hook).
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/vscode/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until, viewerTab, viewerTabs } from "../viewers";

const OLD = "architecture-watch-20261011-090000";
const NEW = "architecture-watch-20261011-120000";

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function diagram(title: string): string {
  return JSON.stringify({ meta: { title }, components: [{ id: "a", type: "backend", label: "A", sources: [{ path: "a.ts" }] }] });
}

suite("FR-WAT-01 watching candidates", () => {
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
    for (const path of [".archify", "a.ts"]) rmSync(join(root, path), { recursive: true, force: true });
  });

  test("a new newest run opens in the group of the viewer of its folder; the old tab stays", async () => {
    const old = write(root, `.archify/${OLD}/candidate.sir`, diagram("Old"));
    const code = write(root, "a.ts", "export {};\n");
    await vscode.window.showTextDocument(vscode.Uri.file(code), { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("sustain.openArchitecture");
    const oldTab = await viewerTab(old);
    assert.equal(oldTab.group.viewColumn, vscode.ViewColumn.Two);
    const newest = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await until(() => hook.viewers().some((viewer) => viewer.file === newest), "the new run to open");
    assert.deepEqual(
      hook.viewers().map((viewer) => [viewer.file, viewer.title]),
      [
        [old, "Old"],
        [newest, "New"],
      ],
    );
    assert.equal((await viewerTab(newest)).group.viewColumn, vscode.ViewColumn.Two);
    assert.equal(viewerTabs().length, 2);
    assert.equal(ui.infos.length, 0, "no notification while a viewer shows that folder");
  });

  test("a change to the shown file reloads it", async () => {
    const file = write(root, `.archify/${OLD}/candidate.sir`, diagram("Before"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(hook.viewers()[0]?.title, "Before");
    writeFileSync(file, diagram("After"));
    await until(() => hook.viewers()[0]?.title === "After", "the reloaded title");
    assert.equal(hook.viewers()[0]!.file, file);
  });

  test("deleting the shown file keeps its tab with the deleted state", async () => {
    const file = write(root, `.archify/${OLD}/candidate.sir`, diagram("Doomed"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    rmSync(file);
    await until(() => hook.viewers()[0]?.title === undefined, "the deleted state");
    assert.deepEqual(hook.viewers().map((viewer) => viewer.file), [file]);
    await viewerTab(file);
  });

  test("without a viewer a new candidate is announced and Open opens it", async () => {
    mkdirSync(join(root, ".archify"), { recursive: true });
    ui.answers.info.push("Open");
    const file = write(root, `.archify/${NEW}/candidate.sir`, diagram("Announced"));
    await until(() => ui.infos.length > 0, "the notification");
    assert.equal(ui.infos[0]!.message, `New architecture diagram: \`${NEW}\``);
    assert.deepEqual(ui.infos[0]!.rest, ["Open"]);
    await until(() => hook.viewers().some((viewer) => viewer.file === file), "the viewer to open");
  });

  test("an older candidate appearing opens nothing; a newer one does", async () => {
    const newest = write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    write(root, `.archify/${OLD}/candidate.sir`, diagram("Old"));
    const newer = write(root, `.archify/architecture-watch-20261011-130000/candidate.sir`, diagram("Newer"));
    await until(() => hook.viewers().length > 1, "the newer candidate to open");
    assert.deepEqual(hook.viewers().map((viewer) => viewer.file), [newest, newer]);
  });
});
