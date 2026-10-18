// RCH-01: Export Page writes the shown map's page beside its candidate.
import * as assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-page-20261018-120000";

suite("RCH-01 Export Page", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    mkdirSync(join(root, ".archify", RUN), { recursive: true });
    writeFileSync(
      join(root, ".archify", RUN, "candidate.json"),
      JSON.stringify({ meta: { title: "Shop", output: `.archify/${RUN}/shop.html` }, components: [{ id: "a", type: "backend", label: "A", sources: [{ path: "a.ts" }] }] }),
    );
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    rmSync(join(root, ".archify"), { recursive: true, force: true });
  });

  test("RCH-01 the map's Export Page writes meta.output with the map and the viewer", async () => {
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => hook.panelState().open, "the map");
    await vscode.commands.executeCommand("sustain.exportPage");
    const html = readFileSync(join(root, ".archify", RUN, "shop.html"), "utf8");
    assert.match(html, /<title>Shop<\/title>/);
    assert.match(html, /<script type="application\/json" id="sustain-data">/);
    assert.equal(html.match(/<script>/g)?.length, 1);
    assert.equal(ui.infos[0]?.message, `Wrote the diagram page: .archify/${RUN}/shop.html`);
  });
});
