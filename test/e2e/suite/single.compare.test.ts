// FR-CMP-05..08: the baseline of each viewer tab, Compare with…, the webview actions and
// watching the baseline (FR-TEST-01 test hook, stub UI).
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook, ViewerState } from "../../../src/vscode/extension";
import type { WebviewMessage } from "../../../src/viewer/protocol";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until, viewerTab, viewerTabsOf } from "../viewers";

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

function selection(editor: vscode.TextEditor | undefined): [number, number, number, number] | undefined {
  if (!editor) return undefined;
  const { start, end } = editor.selection;
  return [start.line, start.character, end.line, end.character];
}

suite("FR-CMP-05..08 change view host", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  const candidate = (run: string): string => join(root, ".archify", run, "candidate.sir");

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(root, "src/web.ts", "web\n");
    write(root, "src/api.ts", "a\nbb\nccc\n");
    write(root, `.archify/${OLD}/candidate.sir`, diagram("Old"));
    write(root, `.archify/${OTHER}/candidate.sir`, diagram("Other"));
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
    return write(root, `.archify/${NEW}/candidate.sir`, diagram("New"));
  }

  /** Opens the newest candidate with `Open Architecture` and waits for its tab. */
  async function openNewest(file: string): Promise<void> {
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await viewerTab(file);
  }

  /** The (first) viewer of `file`. */
  function viewer(file: string): ViewerState | undefined {
    return hook.viewers().find((state) => state.file === file);
  }

  /** Posts `message` from the webview of NEW's viewer. */
  function post(message: WebviewMessage): Promise<void> {
    return hook.postFromWebview(candidate(NEW), message);
  }

  test("FR-CMP-05 a run linked by previousRun opens with the previous run as baseline", async () => {
    const file = writeNew();
    await openNewest(file);
    assert.deepEqual(hook.viewers(), [{ file, baseline: candidate(OLD), active: true, title: "New" }]);
  });

  test("FR-CMP-05 a run without a lineage opens without a baseline", async () => {
    await openNewest(candidate(OLD));
    assert.deepEqual(hook.viewers(), [{ file: candidate(OLD), baseline: null, active: true, title: "Old" }]);
  });

  test("FR-CMP-06 the picker lists No comparison, then the other runs in run order with tags", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    ui.answers.quickPick.push(undefined);
    await post({ type: "compareWith" });
    assert.equal(ui.quickPicks.length, 1);
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => [item.label, item.description, item.detail, item.picked]),
      [
        ["No comparison", undefined, undefined, undefined],
        ["Old", OLD, "previous", true],
        ["Other", OTHER, "different focus", undefined],
      ],
    );
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OLD), "Escape changes nothing");
  });

  test("FR-CMP-06 a newer run is tagged after its commit and mode", async () => {
    writeNew();
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(candidate(OLD)), "sustain.architecture");
    await viewerTab(candidate(OLD));
    assert.deepEqual(hook.viewers(), [{ file: candidate(OLD), baseline: null, active: true, title: "Old" }]);
    ui.answers.quickPick.push(undefined);
    await hook.postFromWebview(candidate(OLD), { type: "compareWith" });
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => [item.label, item.description, item.detail, item.picked]),
      [
        ["No comparison", undefined, undefined, true],
        ["New", NEW, "1234567 Add cart · update · newer", undefined],
        ["Other", OTHER, "different focus", undefined],
      ],
    );
    assert.equal(viewer(candidate(OLD))?.baseline, null);
  });

  test("FR-CMP-06 choosing No comparison clears the baseline; choosing an older run sets it", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    ui.answers.quickPick.push("No comparison");
    await post({ type: "compareWith" });
    assert.equal(viewer(candidate(NEW))?.baseline, null);
    assert.equal(ui.quickPicks[0]![0]!.picked, undefined);
    ui.answers.quickPick.push("Other");
    await post({ type: "compareWith" });
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OTHER));
    assert.equal(ui.quickPicks[1]![0]!.picked, true, "No comparison is picked while there is no baseline");
    ui.answers.quickPick.push("Old");
    await post({ type: "compareWith" });
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OLD));
    assert.equal(hook.viewers().length, 1);
  });

  test("FR-CMP-06 two tabs of the same file keep their own baselines", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await vscode.commands.executeCommand("vscode.openWith", vscode.Uri.file(candidate(NEW)), "sustain.architecture", vscode.ViewColumn.Two);
    await until(() => viewerTabsOf(candidate(NEW)).length === 2, "a second tab of the same file");
    ui.answers.quickPick.push("No comparison");
    await post({ type: "compareWith" });
    assert.deepEqual(
      hook.viewers().map((state) => [state.file, state.baseline, state.active]),
      [
        [candidate(NEW), candidate(OLD), false],
        [candidate(NEW), null, true],
      ],
    );
  });

  test("FR-CMP-07 Open baseline opens the baseline in its own tab with its own default baseline", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "openBaseline" });
    assert.deepEqual(
      hook.viewers().map((state) => [state.file, state.baseline, state.active]),
      [
        [candidate(NEW), candidate(OLD), false],
        [candidate(OLD), null, true],
      ],
    );
    assert.equal((await viewerTab(candidate(OLD))).group.viewColumn, vscode.ViewColumn.One);
  });

  test("FR-CMP-07 Swap opens the baseline in its own tab, compared with the file it came from", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "swap" });
    assert.deepEqual(
      hook.viewers().map((state) => [state.file, state.baseline, state.active]),
      [
        [candidate(NEW), candidate(OLD), false],
        [candidate(OLD), candidate(NEW), true],
      ],
    );
  });

  test("FR-CMP-07 Swap onto an open tab of the baseline sets that tab's baseline", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "openBaseline" });
    assert.equal(viewer(candidate(OLD))?.baseline, null);
    await post({ type: "swap" });
    assert.deepEqual(
      hook.viewers().map((state) => [state.file, state.baseline, state.active]),
      [
        [candidate(NEW), candidate(OLD), false],
        [candidate(OLD), candidate(NEW), true],
      ],
    );
    assert.equal(viewerTabsOf(candidate(OLD)).length, 1);
  });

  test("FR-CMP-07 openFile opens a listed path at the top in the other column", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "openFile", path: "src/api.ts" });
    const editor = vscode.window.activeTextEditor;
    assert.equal(editor?.document.uri.fsPath, join(root, "src/api.ts"));
    assert.deepEqual(selection(editor), [0, 0, 0, 0]);
    assert.equal(editor?.viewColumn, vscode.ViewColumn.Two);
    assert.equal(ui.errors.length, 0);
  });

  test("FR-CMP-07 openFile ignores a path that is not in changes.json", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "openFile", path: "src/web.ts" });
    assert.equal(vscode.window.activeTextEditor, undefined);
    assert.equal(ui.errors.length, 0);
  });

  test("FR-CMP-07 openFile ignores changes.json paths once the comparison is gone", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    ui.answers.quickPick.push("No comparison");
    await post({ type: "compareWith" });
    await post({ type: "openFile", path: "src/api.ts" });
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  test("FR-CMP-07 openFile of a deleted listed path shows the stale reference message", async () => {
    writeNew();
    await openNewest(candidate(NEW));
    await post({ type: "openFile", path: "src/gone.ts" });
    assert.deepEqual(
      ui.errors.map((call) => call.message),
      ["Stale reference: `src/gone.ts` no longer exists"],
    );
    assert.equal(vscode.window.activeTextEditor, undefined);
  });

  /**
   * Opens NEW and picks OLD as its baseline. A chosen baseline survives a reload of NEW: the
   * watcher's late creation event for NEW would otherwise re-take the default baseline, which
   * is none once OLD is broken.
   */
  async function openWithOldChosen(): Promise<void> {
    await openNewest(candidate(NEW));
    ui.answers.quickPick.push("Old");
    await post({ type: "compareWith" });
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OLD));
  }

  test("FR-CMP-08 a broken baseline keeps it with a status message; deleting it drops it", async () => {
    writeNew();
    await openWithOldChosen();
    writeFileSync(candidate(OLD), "{ not json");
    const unreadable = `Can't read baseline \`${OLD}\``;
    await until(() => ui.statusMessages.some((message) => message.text === unreadable), "the unreadable-baseline message");
    assert.deepEqual(
      ui.statusMessages.find((message) => message.text === unreadable),
      { text: unreadable, timeout: 3000 },
    );
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OLD));
    rmSync(candidate(OLD));
    await until(() => viewer(candidate(NEW))?.baseline === null, "the baseline to be dropped");
    await until(() => ui.statusMessages.some((message) => message.text.startsWith("Baseline diagram")), "the deleted-baseline message");
    assert.deepEqual(
      ui.statusMessages.filter((message) => message.text.startsWith("Baseline diagram")),
      [{ text: "Baseline diagram was deleted; showing no comparison.", timeout: 3000 }],
    );
    assert.deepEqual(hook.viewers().map((state) => state.file), [candidate(NEW)]);
  });

  test("FR-CMP-08 a change to the baseline keeps it", async () => {
    writeNew();
    await openWithOldChosen();
    writeFileSync(candidate(OLD), diagram("Old, edited"));
    // A broken write afterwards proves the watcher re-read the baseline after both events.
    writeFileSync(candidate(OLD), "{ not json");
    await until(() => ui.statusMessages.some((message) => message.text === `Can't read baseline \`${OLD}\``), "the re-read baseline");
    writeFileSync(candidate(OLD), diagram("Old again"));
    assert.equal(viewer(candidate(NEW))?.baseline, candidate(OLD));
  });

  test("FR-CMP-08 a newer run opens with its default baseline; the open tab keeps its choice", async () => {
    const file = writeNew();
    await openNewest(file);
    ui.answers.quickPick.push("No comparison");
    await post({ type: "compareWith" });
    write(root, `.archify/${NEWEST}/lineage.json`, lineage(NEW));
    const newest = write(root, `.archify/${NEWEST}/candidate.sir`, diagram("Newest"));
    await until(() => viewer(newest) !== undefined, "the newest run to open");
    assert.equal(viewer(newest)?.baseline, file);
    assert.equal(viewer(file)?.baseline, null);
  });
});
