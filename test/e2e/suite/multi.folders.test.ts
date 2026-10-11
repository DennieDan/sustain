// FR-WS-01 in a two-folder workspace: commands ask which folder to use.
import * as assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

suite("FR-WS-01 multi-root workspace", () => {
  let ui: UiStubs;
  let folders: string[];

  setup(() => {
    ui = stubUi();
    folders = vscode.workspace.workspaceFolders!.map((folder) => folder.uri.fsPath);
  });

  teardown(() => {
    ui.restore();
    for (const folder of folders) {
      rmSync(join(folder, ".agents"), { recursive: true, force: true });
      rmSync(join(folder, ".claude"), { recursive: true, force: true });
    }
  });

  test("the QuickPick lists every folder and the pick decides the repo root", async () => {
    assert.equal(folders.length, 2);
    ui.answers.quickPick.push("beta");
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => item.label),
      ["alpha", "beta"],
    );
    assert.equal(existsSync(join(folders[1]!, ".agents/skills/sustain-architecture/SKILL.md")), true);
    assert.equal(existsSync(join(folders[0]!, ".agents")), false);
  });

  test("dismissing the folder pick does nothing", async () => {
    ui.answers.quickPick.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.inputBoxes.length + ui.infos.length + ui.errors.length, 0);
    for (const folder of folders) assert.equal(existsSync(join(folder, ".agents")), false);
  });
});
