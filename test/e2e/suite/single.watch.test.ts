// FR-WAT-01: candidates created or modified on disk reach the panel (FR-TEST-01 test hook).
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

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

/**
 * Waits for `condition`. The real file watcher and the 300 ms debounce run on the platform
 * clock in the extension host, so there is no event to await from the test; poll briefly.
 */
async function until(condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 50);
    await promise;
  }
}

function panelLabel(): string | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith("sustain.architecture"))?.label;
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
    rmSync(join(root, ".archify"), { recursive: true, force: true });
  });

  test("a new newest candidate loads into the open panel", async () => {
    const old = write(root, `.archify/${OLD}/candidate.json`, diagram("Old"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(hook.panelState().file, old);
    const newest = write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    await until(() => hook.panelState().file === newest, "the panel to switch to the new candidate");
    await until(() => panelLabel() === "Architecture: New", "the new title");
    assert.equal(ui.infos.length, 0, "no notification while the panel shows that folder");
  });

  test("a change to the shown file reloads it", async () => {
    const file = write(root, `.archify/${OLD}/candidate.json`, diagram("Before"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => panelLabel() === "Architecture: Before", "the first title");
    writeFileSync(file, diagram("After"));
    await until(() => panelLabel() === "Architecture: After", "the reloaded title");
    assert.equal(hook.panelState().file, file);
  });

  test("without a panel a new candidate is announced and Open opens it", async () => {
    mkdirSync(join(root, ".archify"), { recursive: true });
    ui.answers.info.push("Open");
    const file = write(root, `.archify/${NEW}/candidate.json`, diagram("Announced"));
    await until(() => ui.infos.length > 0, "the notification");
    assert.equal(ui.infos[0]!.message, `New architecture diagram: \`${NEW}\``);
    assert.deepEqual(ui.infos[0]!.rest, ["Open"]);
    await until(() => hook.panelState().file === file, "the panel to open");
  });

  test("an older candidate appearing does not replace the shown newest one", async () => {
    const newest = write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    write(root, `.archify/${OLD}/candidate.json`, diagram("Old"));
    write(root, `.archify/architecture-watch-20261011-130000/candidate.json`, diagram("Newer"));
    await until(() => hook.panelState().file !== newest, "the newer candidate to load");
    assert.equal(hook.panelState().file, join(root, ".archify/architecture-watch-20261011-130000/candidate.json"));
  });
});
