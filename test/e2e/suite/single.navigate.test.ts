// FR-NAV-01..03 through the panel's message handler (FR-TEST-01 test hook).
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

const RUN = "architecture-nav-20261011-100000";

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

const DIAGRAM = {
  schema_version: 1,
  diagram_type: "architecture",
  meta: { title: "Navigation", output: ".archify/x/x.html" },
  components: [
    { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 2, end_line: 4 }, { path: "src/api.ts" }] },
    { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts", line: 2 }] },
    { id: "db", type: "database", label: "Orders DB" },
    { id: "bad", type: "external", label: "Bad", sources: [{ path: "../outside.ts" }] },
    { id: "gone", type: "external", label: "Gone", sources: [{ path: "src/gone.ts", line: 1 }] },
    { id: "far", type: "external", label: "Far", sources: [{ path: "src/api.ts", line: 2, end_line: 9 }] },
  ],
};

function selection(editor: vscode.TextEditor | undefined): [number, number, number, number] | undefined {
  if (!editor) return undefined;
  const { start, end } = editor.selection;
  return [start.line, start.character, end.line, end.character];
}

suite("FR-NAV-01..03 navigation", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(root, "src/web.ts", "line 1\nline 2\nline 3\nline four\nline 5\n");
    write(root, "src/api.ts", "a\nbb\nccc\n");
    write(root, `.archify/${RUN}/candidate.json`, JSON.stringify(DIAGRAM));
    ui = stubUi();
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const dir of [".archify", "src"]) rmSync(join(root, dir), { recursive: true, force: true });
  });

  /** Opens the panel and waits until the workbench shows its tab, as it is before a user can click. */
  async function openPanel(): Promise<void> {
    const shown = (): boolean =>
      vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.label === "Architecture: Navigation"));
    const { promise, resolve } = Promise.withResolvers<void>();
    const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
      if (shown()) resolve();
    });
    await vscode.commands.executeCommand("sustain.openArchitecture");
    if (shown()) resolve();
    await promise;
    subscription.dispose();
    assert.equal(hook.panelState().file, join(root, ".archify", RUN, "candidate.json"));
  }

  test("line and end_line select the whole lines in the other column", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "web", index: 0 });
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor?.document.uri.fsPath, join(root, "src/web.ts"));
    assert.deepEqual(selection(editor), [1, 0, 3, "line four".length]);
    assert.equal(editor?.viewColumn, vscode.ViewColumn.Two);
    assert.equal(ui.errors.length, 0);
  });

  test("line only selects that line", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "api", index: 0 });
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, join(root, "src/api.ts"));
    assert.deepEqual(selection(vscode.window.activeTextEditor), [1, 0, 1, 2]);
  });

  test("a source without lines (a tooltip entry with index 1) opens at the top without a selection", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "web", index: 1 });
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, join(root, "src/api.ts"));
    assert.deepEqual(selection(vscode.window.activeTextEditor), [0, 0, 0, 0]);
  });

  test("with the panel in column 2 the code opens in column 1", async () => {
    await vscode.window.showTextDocument(vscode.Uri.file(join(root, "src/api.ts")), { viewColumn: vscode.ViewColumn.One });
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "web", index: 0 });
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, join(root, "src/web.ts"));
    assert.equal(vscode.window.activeTextEditor?.viewColumn, vscode.ViewColumn.One);
  });

  test("a component without sources shows the status bar message for 3 s and opens nothing", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "db", index: 0 });
    assert.deepEqual(ui.statusMessages, [{ text: "`Orders DB` has no source references", timeout: 3000 }]);
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("a path outside the repo root is an invalid source path; nothing opens", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "bad", index: 0 });
    assert.deepEqual(
      ui.errors.map((call) => call.message),
      ["Invalid source path: `../outside.ts`"],
    );
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("a missing file is a stale reference; nothing opens", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "gone", index: 0 });
    assert.deepEqual(
      ui.errors.map((call) => call.message),
      ["Stale reference: `src/gone.ts` no longer exists"],
    );
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("lines beyond the file report the counts and open the file without a selection", async () => {
    await openPanel();
    await hook.postFromWebview({ type: "openSource", componentId: "far", index: 0 });
    assert.deepEqual(
      ui.errors.map((call) => call.message),
      ["Stale reference: `src/api.ts` has 3 lines; the diagram cites 2–9"],
    );
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, join(root, "src/api.ts"));
    assert.deepEqual(selection(vscode.window.activeTextEditor), [0, 0, 0, 0]);
  });

  test("a ready message re-sends without changing the panel state", async () => {
    await openPanel();
    const before = hook.panelState();
    await hook.postFromWebview({ type: "ready" });
    assert.deepEqual(hook.panelState(), before);
  });
});
