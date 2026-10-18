// SKL-02: Tour in the map's title bar plays the map's tour.json, opening each stop's code beside the
// map, and Create tour on a map launches the tour skill for its run folder.
import * as assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-tour-20261019-120000";

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function shownAt(path: string): vscode.TextEditor | undefined {
  return vscode.window.visibleTextEditors.find((editor) => editor.document.uri.fsPath === path);
}

suite("SKL-02 Guided tours", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let bin: string;
  const terminals: vscode.Terminal[] = [];

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    write(root, "src/web.ts", "import { api } from './api';\nexport const web = () => api();\n");
    write(root, "src/api.ts", "export const api = () => 1;\n");
    write(
      root,
      `.archify/${RUN}/candidate.json`,
      JSON.stringify({
        meta: { title: "Shop" },
        components: [
          { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 2 }] },
          { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts", line: 1 }] },
        ],
        connections: [{ from: "web", to: "api" }],
      }),
    );
  });

  teardown(async () => {
    ui.restore();
    if (savedPath !== undefined) process.env["PATH"] = savedPath;
    savedPath = undefined;
    for (const terminal of terminals.splice(0)) terminal.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    for (const path of [".archify", "src"]) rmSync(join(root, path), { recursive: true, force: true });
    if (bin !== undefined) rmSync(bin, { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("SKL-02 Tour opens each stop's code beside the map", async () => {
    const stop = (component: string, path: string, line: number): object => ({ component, title: `At ${path}`, explanation: "Here the work happens.", question: "What runs here?", answer: "The handler.", citation: { path, line } });
    write(root, `.archify/${RUN}/tour.json`, JSON.stringify({ schema: 1, createdAt: "2026-10-19T12:00:00Z", stops: [stop("web", "src/web.ts", 2), stop("api", "src/api.ts", 1), stop("web", "src/web.ts", 1), stop("api", "src/api.ts", 1)] }));
    await hook.postFromHome({ type: "openMap", file: join(root, ".archify", RUN, "candidate.json") });
    await until(() => hook.panelTour()?.length === 4, "the panel to read the tour");

    await vscode.commands.executeCommand("sustain.playTour");
    await until(() => shownAt(join(root, "src/web.ts")) !== undefined, "the first stop's code");
    const first = shownAt(join(root, "src/web.ts"))!;
    assert.equal(first.selection.start.line, 1);
    assert.notEqual(first.viewColumn, vscode.ViewColumn.One, "the code opens beside the map");

    await hook.postFromWebview({ type: "tourStop", index: 1 });
    await until(() => shownAt(join(root, "src/api.ts")) !== undefined, "the second stop's code");
  });

  test("SKL-02 Create tour on a map without one launches the tour skill for its run folder", async () => {
    bin = mkdtempSync(join(tmpdir(), "sustain-bin-"));
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n");
    chmodSync(join(bin, "claude"), 0o755);
    savedPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${savedPath}`;
    writeSkill(homedir(), join(vscode.extensions.getExtension("sustain.sustain")!.extensionPath, "dist/skills/sustain-tour"), skillTargets(homedir(), "sustain-tour"), "sustain-tour");
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", "terminal", vscode.ConfigurationTarget.Global);
    const opened = new Promise<vscode.Terminal>((resolve) => {
      const subscription = vscode.window.onDidOpenTerminal((terminal) => {
        subscription.dispose();
        resolve(terminal);
      });
    });
    await hook.postFromHome({ type: "createTour", file: join(root, ".archify", RUN, "candidate.json") });
    const terminal = await opened;
    terminals.push(terminal);
    assert.deepEqual((terminal.creationOptions as vscode.TerminalOptions).shellArgs, [`/sustain-tour ${RUN}`]);
  });
});
