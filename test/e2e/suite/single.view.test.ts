// FR-VIEW-01 (open commands) and FR-VIEW-04 (panel) in a single-folder workspace.
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

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

function webviewTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => tab.input instanceof vscode.TabInputWebview && tab.input.viewType.endsWith("sustain.architecture"));
}

/** The architecture panel's tab once it carries `label` (tab state reaches the extension host asynchronously). */
async function panelTab(label: string): Promise<vscode.Tab> {
  const find = (): vscode.Tab | undefined => webviewTabs().find((tab) => tab.label === label);
  const existing = find();
  if (existing) return existing;
  const { promise, resolve, reject } = Promise.withResolvers<vscode.Tab>();
  const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
    const tab = find();
    if (tab) resolve(tab);
  });
  // Guard only: report the tabs that do exist instead of waiting for mocha's generic timeout.
  const guard = setTimeout(() => reject(new Error(`no panel tab "${label}"; tabs: ${webviewTabs().map((tab) => tab.label).join(", ")}`)), 5_000);
  try {
    return await promise;
  } finally {
    subscription.dispose();
    clearTimeout(guard);
  }
}

suite("FR-VIEW-01/04 open commands and panel", () => {
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
    assert.equal(hook.panelState().open, false);
  });

  test("opens the newest candidate in the active column when no editor is open", async () => {
    write(root, `.archify/${OLD}/candidate.json`, diagram("Old"));
    const newest = write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.deepEqual(hook.panelState(), { file: newest, open: true });
    const tab = await panelTab("Architecture: New");
    assert.equal(tab.group.viewColumn, vscode.ViewColumn.One);
    assert.equal(ui.errors.length, 0);
  });

  test("re-running reveals and reloads the same single panel", async () => {
    const file = write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    writeFileSync(file, diagram("Renamed"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await panelTab("Architecture: Renamed");
    assert.equal(webviewTabs().length, 1);
  });

  test("opens beside an open editor", async () => {
    write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    const code = write(root, "src/web.ts", "export {};\n");
    await vscode.window.showTextDocument(vscode.Uri.file(code), { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal((await panelTab("Architecture: New")).group.viewColumn, vscode.ViewColumn.Two);
  });

  test("Open Architecture File… lists candidates newest first with titles, plus Browse…", async () => {
    const older = write(root, `.archify/${OLD}/candidate.json`, diagram("Old"));
    write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    ui.answers.quickPick.push(OLD);
    await vscode.commands.executeCommand("sustain.openArchitectureFile");
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => [item.label, item.description]),
      [
        [NEW, "New"],
        [OLD, "Old"],
        ["Browse…", undefined],
      ],
    );
    assert.equal(hook.panelState().file, older);
    await panelTab("Architecture: Old");
  });

  test("Browse… opens a JSON file chosen in the file dialog", async () => {
    const browsed = write(root, "docs/system.json", diagram("Browsed"));
    ui.answers.quickPick.push("Browse…");
    ui.answers.openDialog.push(browsed);
    await vscode.commands.executeCommand("sustain.openArchitectureFile");
    assert.deepEqual(ui.openDialogs[0]?.filters, { JSON: ["json"] });
    assert.equal(hook.panelState().file, browsed);
    await panelTab("Architecture: Browsed");
  });

  test("an unreadable diagram shows the error and an empty-state panel", async () => {
    write(root, `.archify/${NEW}/candidate.json`, "{ not json");
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(ui.errors.length, 1);
    assert.match(ui.errors[0]!.message, new RegExp(`^Can't show \`\\.archify/${NEW}/candidate\\.json\`: invalid JSON`));
    assert.equal(hook.panelState().open, true);
    await panelTab("Architecture: candidate.json");
  });

  test("a document without components is refused with the reason", async () => {
    write(root, `.archify/${NEW}/candidate.json`, JSON.stringify({ meta: { title: "Empty" }, components: [] }));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(ui.errors[0]?.message, `Can't show \`.archify/${NEW}/candidate.json\`: it has no components`);
  });

  test("closing the panel clears the panel state", async () => {
    write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
    await vscode.commands.executeCommand("sustain.openArchitecture");
    assert.equal(hook.panelState().open, true);
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    assert.deepEqual(hook.panelState(), { file: undefined, open: false });
  });
});
