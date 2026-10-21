// ARC-01: an import that breaks a rule in sustain.config.json shows in the Problems panel at its
// line, and the diagnostic goes when the import is fixed. ARC-02: a rule written from the map shows
// its diff and is saved only on a yes.
import * as assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/vscode/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-rules-20261019-000000";

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

suite("ARC-01 architecture rules", () => {
  let root: string;
  let handler: vscode.Uri;
  let ui: UiStubs;

  suiteSetup(async () => {
    await vscode.extensions.getExtension("sustain.sustain")!.activate();
  });

  setup(() => {
    ui = stubUi();
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    handler = vscode.Uri.file(write(root, "src/api/handler.ts", "export const handle = 1;\n"));
    write(root, "src/store/db.ts", "export const db = 1;\n");
    write(
      root,
      `.archify/${RUN}/candidate.sir`,
      JSON.stringify({
        meta: { title: "Rules" },
        components: [
          { id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1 }] },
          { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
        ],
      }),
    );
    write(root, "sustain.config.json", JSON.stringify({ map: RUN, rules: [{ id: "api-not-store", kind: "forbid", from: "api", to: "store", reason: "The API reads through the repository layer." }] }));
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const rel of [".archify", "src", "sustain.config.json"]) rmSync(join(root, rel), { recursive: true, force: true });
  });

  /** Replaces the handler's text and saves it. */
  async function save(text: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(handler);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(handler, new vscode.Range(0, 0, document.lineCount, 0), text);
    await vscode.workspace.applyEdit(edit);
    await document.save();
  }

  test("ARC-01 a violating import shows a diagnostic at its line, and fixing it clears it", async () => {
    await save('export const version = 2;\nimport { db } from "../store/db";\nexport const handle = db;\n');
    await until(() => vscode.languages.getDiagnostics(handler).length === 1, "the rule's diagnostic");
    const [diagnostic] = vscode.languages.getDiagnostics(handler);
    assert.equal(diagnostic!.range.start.line, 1);
    assert.equal(diagnostic!.severity, vscode.DiagnosticSeverity.Warning);
    assert.equal(diagnostic!.source, "Sustain");
    assert.equal(diagnostic!.message, "api-not-store: imports src/store/db.ts. The API reads through the repository layer.");

    await save("export const handle = 1;\n");
    await until(() => vscode.languages.getDiagnostics(handler).length === 0, "the diagnostic to clear");
  });
});

suite("ARC-02 rules from the map", () => {
  let root: string;
  let hook: TestHook;
  let ui: UiStubs;
  const config = (): { rules: { id: string; kind: string; from: string[]; to: string[]; reason: string }[] } => JSON.parse(readFileSync(join(root, "sustain.config.json"), "utf8"));

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    ui = stubUi();
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(root, "src/api/handler.ts", "export const handle = 1;\n");
    write(root, "src/store/db.ts", "export const db = 1;\n");
    write(
      root,
      `.archify/${RUN}/candidate.sir`,
      JSON.stringify({
        meta: { title: "Rules" },
        components: [
          { id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1 }] },
          { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
        ],
        connections: [{ from: "api", to: "store" }],
      }),
    );
    write(root, "sustain.config.json", JSON.stringify({ map: RUN }));
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const rel of [".archify", "src", "sustain.config.json"]) rmSync(join(root, rel), { recursive: true, force: true });
  });

  test("ARC-02 Forbid This Dependency shows the config's diff, saves the rule on Add, and saves nothing on a no", async () => {
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.forbidArrow", { from: "api", to: "store" });
    ui.answers.inputBox.push("The API reads through the repository.");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.forbidArrow", { from: "api", to: "store" });
    assert.deepEqual(config(), { map: RUN });

    ui.answers.inputBox.push("The API reads through the repository.");
    ui.answers.warning.push("Add");
    await vscode.commands.executeCommand("sustain.forbidArrow", { from: "api", to: "store" });
    assert.equal(ui.inputBoxes[0]?.value, "API should not import Store.");
    const ask = ui.warnings.at(-1)!;
    assert.equal(ask.message, "Add this rule to sustain.config.json?");
    assert.deepEqual(ask.rest, [{ modal: true, detail: "forbid-api-store: The API reads through the repository." }, "Add"]);
    const tab = vscode.window.tabGroups.all.flatMap((group) => group.tabs).find((entry) => entry.label.startsWith("sustain.config.json: forbid API to Store"));
    assert.ok(tab, "the diff opened");
    assert.deepEqual(config().rules, [{ id: "forbid-api-store", kind: "forbid", from: ["api"], to: ["store"], reason: "The API reads through the repository." }]);
  });
});
