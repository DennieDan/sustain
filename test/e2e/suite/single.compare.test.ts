// FR-CMP-05..08: the baseline, Compare with…, the webview actions and watching the baseline
// (FR-TEST-01 test hook, stub UI).
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

const OLD = "architecture-cmp-20261011-090000";
const NEW = "architecture-cmp-20261011-120000";
const OTHER = "architecture-misc-20261010-090000";
const NEWEST = "architecture-cmp-20261011-150000";
const HEAD = "1234567".padEnd(40, "0");

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function diagram(title: string): string {
  return JSON.stringify({
    meta: { title },
    components: [
      { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts" }] },
      { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts" }] },
    ],
  });
}

function lineage(previousRun: string): string {
  return JSON.stringify({
    mode: "update",
    reason: "test",
    previousRun,
    baseRevision: HEAD,
    revision: HEAD,
    baseCommit: null,
    headCommit: { subject: "Add cart", committedAt: "2026-10-11T12:00:00+08:00" },
    dirty: [],
    dirtyCount: 0,
    updatesSinceRegeneration: 1,
  });
}

const CHANGES = JSON.stringify({
  baseRevision: HEAD,
  revision: HEAD,
  touchedComponents: [
    {
      id: "api",
      files: [
        { status: "M", path: "src/api.ts" },
        { status: "D", path: "src/gone.ts" },
      ],
    },
  ],
  uncited: [{ status: "A", path: "README.md" }],
});

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

function selection(editor: vscode.TextEditor | undefined): [number, number, number, number] | undefined {
  if (!editor) return undefined;
  const { start, end } = editor.selection;
  return [start.line, start.character, end.line, end.character];
}

suite("FR-CMP-05..08 change view host", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  const candidate = (run: string): string => join(root, ".archify", run, "candidate.json");

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(root, "src/web.ts", "web\n");
    write(root, "src/api.ts", "a\nbb\nccc\n");
    write(root, `.archify/${OLD}/candidate.json`, diagram("Old"));
    write(root, `.archify/${OTHER}/candidate.json`, diagram("Other"));
    ui = stubUi();
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const dir of [".archify", "src"]) rmSync(join(root, dir), { recursive: true, force: true });
  });

  /** Writes NEW as an update of OLD (lineage and changes.json before the candidate). */
  function writeNew(): string {
    write(root, `.archify/${NEW}/lineage.json`, lineage(OLD));
    write(root, `.archify/${NEW}/changes.json`, CHANGES);
    return write(root, `.archify/${NEW}/candidate.json`, diagram("New"));
  }

  /** Opens the newest candidate and waits until the workbench shows the panel's tab. */
  async function openPanel(title: string): Promise<void> {
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(
      () => vscode.window.tabGroups.all.some((group) => group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview && tab.label === `Architecture: ${title}`)),
      `the panel tab "Architecture: ${title}"`,
    );
  }

  test("FR-CMP-05 a run linked by previousRun opens with the previous run as baseline", async () => {
    const file = writeNew();
    await openPanel("New");
    assert.deepEqual(hook.panelState(), { file, open: true, baseline: candidate(OLD) });
  });

  test("FR-CMP-05 a run without a lineage opens without a baseline", async () => {
    await openPanel("Old");
    assert.deepEqual(hook.panelState(), { file: candidate(OLD), open: true, baseline: null });
  });

  test("FR-CMP-06 the picker lists No comparison, then the other runs in run order with tags", async () => {
    writeNew();
    await openPanel("New");
    ui.answers.quickPick.push(undefined);
    await hook.postFromWebview({ type: "compareWith" });
    assert.equal(ui.quickPicks.length, 1);
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => [item.label, item.description, item.detail, item.picked]),
      [
        ["No comparison", undefined, undefined, undefined],
        ["Old", OLD, "previous", true],
        ["Other", OTHER, "different focus", undefined],
      ],
    );
    assert.equal(hook.panelState().baseline, candidate(OLD), "Escape changes nothing");
  });

  test("FR-CMP-06 a newer run is tagged after its commit and mode", async () => {
    writeNew();
    // Open Architecture File… lists run folders as labels; open the older run.
    ui.answers.quickPick.push(OLD);
    await vscode.commands.executeCommand("sustain.openArchitectureFile");
    assert.deepEqual(hook.panelState(), { file: candidate(OLD), open: true, baseline: null });
    ui.answers.quickPick.push(undefined);
    await hook.postFromWebview({ type: "compareWith" });
    assert.deepEqual(
      ui.quickPicks[1]!.map((item) => [item.label, item.description, item.detail, item.picked]),
      [
        ["No comparison", undefined, undefined, true],
        ["New", NEW, "1234567 Add cart · update · newer", undefined],
        ["Other", OTHER, "different focus", undefined],
      ],
    );
    assert.equal(hook.panelState().baseline, null);
  });

  test("FR-CMP-06 choosing No comparison clears the baseline; choosing an older run sets it", async () => {
    writeNew();
    await openPanel("New");
    ui.answers.quickPick.push("No comparison");
    await hook.postFromWebview({ type: "compareWith" });
    assert.equal(hook.panelState().baseline, null);
    assert.equal(ui.quickPicks[0]![0]!.picked, undefined);
    ui.answers.quickPick.push("Other");
    await hook.postFromWebview({ type: "compareWith" });
    assert.equal(hook.panelState().baseline, candidate(OTHER));
    assert.equal(ui.quickPicks[1]![0]!.picked, true, "No comparison is picked while there is no baseline");
    ui.answers.quickPick.push("Old");
    await hook.postFromWebview({ type: "compareWith" });
    assert.equal(hook.panelState().baseline, candidate(OLD));
    assert.equal(hook.panelState().file, candidate(NEW));
  });

  test("FR-CMP-07 Open baseline shows the baseline with its own default baseline", async () => {
    writeNew();
    await openPanel("New");
    await hook.postFromWebview({ type: "openBaseline" });
    assert.deepEqual(hook.panelState(), { file: candidate(OLD), open: true, baseline: null });
  });

  test("FR-CMP-07 Swap shows the baseline compared with the previously open file", async () => {
    writeNew();
    await openPanel("New");
    await hook.postFromWebview({ type: "swap" });
    assert.deepEqual(hook.panelState(), { file: candidate(OLD), open: true, baseline: candidate(NEW) });
  });

  test("FR-CMP-07 openFile opens a listed path at the top in the other column", async () => {
    writeNew();
    await openPanel("New");
    await hook.postFromWebview({ type: "openFile", path: "src/api.ts" });
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor?.document.uri.fsPath, join(root, "src/api.ts"));
    assert.deepEqual(selection(editor), [0, 0, 0, 0]);
    assert.equal(editor?.viewColumn, vscode.ViewColumn.Two);
    assert.equal(ui.errors.length, 0);
  });

  test("FR-CMP-07 openFile ignores a path that is not in changes.json", async () => {
    writeNew();
    await openPanel("New");
    await hook.postFromWebview({ type: "openFile", path: "src/web.ts" });
    assert.equal(vscode.window.activeTextEditor, undefined);
    assert.equal(ui.errors.length, 0);
  });

  test("FR-CMP-07 openFile ignores changes.json paths once the comparison is gone", async () => {
    writeNew();
    await openPanel("New");
    ui.answers.quickPick.push("No comparison");
    await hook.postFromWebview({ type: "compareWith" });
    await hook.postFromWebview({ type: "openFile", path: "src/api.ts" });
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("FR-CMP-07 openFile of a deleted listed path shows the stale reference message", async () => {
    writeNew();
    await openPanel("New");
    await hook.postFromWebview({ type: "openFile", path: "src/gone.ts" });
    assert.deepEqual(
      ui.errors.map((call) => call.message),
      ["Stale reference: `src/gone.ts` no longer exists"],
    );
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("FR-CMP-08 a broken baseline keeps it with a status message; deleting it drops it", async () => {
    writeNew();
    await openPanel("New");
    writeFileSync(candidate(OLD), "{ not json");
    const unreadable = `Can't read baseline \`${OLD}\``;
    await until(() => ui.statusMessages.some((message) => message.text === unreadable), "the unreadable-baseline message");
    assert.deepEqual(
      ui.statusMessages.find((message) => message.text === unreadable),
      { text: unreadable, timeout: 3000 },
    );
    assert.equal(hook.panelState().baseline, candidate(OLD));
    rmSync(candidate(OLD));
    await until(() => hook.panelState().baseline === null, "the baseline to be dropped");
    await until(() => ui.statusMessages.some((message) => message.text.startsWith("Baseline diagram")), "the deleted-baseline message");
    assert.deepEqual(
      ui.statusMessages.filter((message) => message.text.startsWith("Baseline diagram")),
      [{ text: "Baseline diagram was deleted; showing no comparison.", timeout: 3000 }],
    );
    assert.equal(hook.panelState().file, candidate(NEW));
  });

  test("FR-CMP-08 a change to the baseline keeps it", async () => {
    writeNew();
    await openPanel("New");
    writeFileSync(candidate(OLD), diagram("Old, edited"));
    // A broken write afterwards proves the watcher re-read the baseline after both events.
    writeFileSync(candidate(OLD), "{ not json");
    await until(() => ui.statusMessages.some((message) => message.text === `Can't read baseline \`${OLD}\``), "the re-read baseline");
    writeFileSync(candidate(OLD), diagram("Old again"));
    assert.equal(hook.panelState().baseline, candidate(OLD));
    assert.equal(hook.panelState().file, candidate(NEW));
  });

  test("FR-CMP-08 switching to a newer run applies its default baseline", async () => {
    const file = writeNew();
    await openPanel("New");
    ui.answers.quickPick.push("No comparison");
    await hook.postFromWebview({ type: "compareWith" });
    assert.equal(hook.panelState().baseline, null);
    write(root, `.archify/${NEWEST}/lineage.json`, lineage(NEW));
    const newest = write(root, `.archify/${NEWEST}/candidate.json`, diagram("Newest"));
    await until(() => hook.panelState().file === newest, "the panel to switch to the newest run");
    assert.equal(hook.panelState().baseline, file);
  });
});
