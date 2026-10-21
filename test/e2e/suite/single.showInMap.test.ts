// UI-03 and UI-05: Show in Map opens the newest map beside the editor; Map this folder launches
// Generate with the folder as the focus; a box's menu opens its code.
import * as assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { prompts, stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-show-20261018-120000";

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function nextTerminal(): Promise<vscode.Terminal> {
  const { promise, resolve } = Promise.withResolvers<vscode.Terminal>();
  const subscription = vscode.window.onDidOpenTerminal((terminal) => {
    subscription.dispose();
    resolve(terminal);
  });
  return promise;
}

suite("UI-03 Show in Map and UI-05 menus", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let fileA: string;
  let fileB: string;
  const cleanup: string[] = [];
  const terminals: vscode.Terminal[] = [];

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    fileA = write(root, "src/a.ts", "export const a = 1;\n");
    fileB = write(root, "src/b.ts", "export const b = 2;\n");
    write(
      root,
      `.archify/${RUN}/candidate.sir`,
      JSON.stringify({
        components: [
          { id: "a", label: "A", type: "backend", sources: [{ path: "src/a.ts", line: 1 }] },
          { id: "b", label: "B", type: "frontend", sources: [{ path: "src/b.ts", line: 1 }] },
        ],
      }),
    );
    const bin = mkdtempSync(join(tmpdir(), "sustain-bin-"));
    cleanup.push(bin);
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n");
    chmodSync(join(bin, "claude"), 0o755);
    process.env["PATH"] = `${bin}:${savedPath}`;
    const extensionPath = vscode.extensions.getExtension("sustain.sustain")!.extensionPath;
    writeSkill(homedir(), join(extensionPath, "dist/skills/sustain-architecture"), skillTargets(homedir(), "sustain-architecture"), "sustain-architecture");
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", "terminal", vscode.ConfigurationTarget.Global);
  });

  teardown(async () => {
    ui.restore();
    process.env["PATH"] = savedPath;
    for (const terminal of terminals.splice(0)) terminal.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const dir of [".archify", "src"]) rmSync(join(root, dir), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("UI-03 Show in Map opens the map beside the editor and keeps the editor active", async () => {
    await vscode.window.showTextDocument(vscode.Uri.file(fileA));
    await vscode.commands.executeCommand("sustain.showInMap");
    const file = join(root, ".archify", RUN, "candidate.sir");
    await until(() => hook.viewers().some((viewer) => viewer.file === file), "the map to open");
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, fileA);
  });

  test("UI-05 Map this folder launches Generate with the folder as the focus", async () => {
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.mapFolder", vscode.Uri.file(join(root, "src")));
    const terminal = await opened;
    terminals.push(terminal);
    assert.deepEqual((terminal.creationOptions as vscode.TerminalOptions).shellArgs, ["/sustain-architecture src"]);
    assert.equal(prompts(ui), 0);
  });

  test("UI-05 Open code on a box opens its first source", async () => {
    await vscode.commands.executeCommand("sustain.openBoxCode", { componentId: "b", webview: "sustain.architecture" });
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === fileB, "src/b.ts to open");
  });
});
