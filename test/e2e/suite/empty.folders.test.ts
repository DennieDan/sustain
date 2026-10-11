// FR-WS-01 with no folder open.
import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

suite("FR-WS-01 no folder open", () => {
  let ui: UiStubs;

  setup(() => {
    ui = stubUi();
  });

  teardown(() => ui.restore());

  test("the window has no workspace folder", () => {
    assert.equal(vscode.workspace.workspaceFolders, undefined);
  });

  for (const command of ["sustain.installSkills", "sustain.generateArchitecture"]) {
    test(`${command} shows "Open a folder first."`, async () => {
      await vscode.commands.executeCommand(command);
      assert.deepEqual(
        ui.errors.map((call) => call.message),
        ["Open a folder first."],
      );
      assert.equal(ui.quickPicks.length + ui.inputBoxes.length + ui.infos.length + ui.warnings.length, 0);
    });
  }
});
