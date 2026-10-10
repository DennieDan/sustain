import * as assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { suite, test } from "../tdd";

const EXTENSION_ID = "sustain.sustain";

suite("smoke", () => {
  test("the extension is installed and activates", async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `${EXTENSION_ID} is not installed in the test host`);
    await extension.activate();
    assert.equal(extension.isActive, true);
  });

  test("the built bundle ships the skill files", () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension);
    const example = join(extension.extensionPath, "dist/skills/sustain-architecture/references/example.json");
    assert.ok(existsSync(example), `missing ${example}`);
  });

  test("a workspace folder is open", () => {
    assert.equal(vscode.workspace.workspaceFolders?.length, 1);
  });
});
