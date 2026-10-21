// SET-05: with sustain.usageLog on, counted actions add to the day's counts; Export Usage Log saves
// the log through a save dialog, and Clear Usage Log deletes it. With the setting off, nothing is kept.
import * as assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/vscode/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

suite("SET-05 Opt-in usage log", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let scratch: string;
  let savedSaveDialog: typeof vscode.window.showSaveDialog;
  const today = (): Record<string, number> => hook.usageLog().days[new Date().toISOString().slice(0, 10)] ?? {};

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    ui = stubUi();
    scratch = mkdtempSync(join(tmpdir(), "sustain-usage-"));
    savedSaveDialog = vscode.window.showSaveDialog;
    (vscode.window as { showSaveDialog: unknown }).showSaveDialog = async () => vscode.Uri.file(join(scratch, "usage.json"));
    await vscode.commands.executeCommand("sustain.clearUsageLog");
  });

  teardown(async () => {
    ui.restore();
    (vscode.window as { showSaveDialog: unknown }).showSaveDialog = savedSaveDialog;
    await vscode.workspace.getConfiguration("sustain").update("usageLog", undefined, vscode.ConfigurationTarget.Global);
    rmSync(scratch, { recursive: true, force: true });
  });

  test("SET-05 with the log on, actions are counted by day, Export saves them and Clear deletes them", async () => {
    await vscode.workspace.getConfiguration("sustain").update("usageLog", true, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand("sustain.copyPromptFor");
    await vscode.commands.executeCommand("sustain.copyPromptFor");
    await hook.postFromHome({ type: "copyPromptFor", focus: "" });
    assert.deepEqual(today(), { copyPrompt: 3 });
    await vscode.commands.executeCommand("sustain.exportUsageLog");
    assert.deepEqual(JSON.parse(readFileSync(join(scratch, "usage.json"), "utf8")), hook.usageLog());
    await vscode.commands.executeCommand("sustain.clearUsageLog");
    assert.deepEqual(hook.usageLog(), { schema: 1, days: {} });
  });

  test("SET-05 with the log off, nothing is counted", async () => {
    await vscode.commands.executeCommand("sustain.copyPromptFor");
    assert.deepEqual(hook.usageLog(), { schema: 1, days: {} });
  });
});
