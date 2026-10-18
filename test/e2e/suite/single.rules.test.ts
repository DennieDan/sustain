// ARC-01: an import that breaks a rule in sustain.config.json shows in the Problems panel at its
// line, and the diagnostic goes when the import is fixed.
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
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

  suiteSetup(async () => {
    await vscode.extensions.getExtension("sustain.sustain")!.activate();
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    handler = vscode.Uri.file(write(root, "src/api/handler.ts", "export const handle = 1;\n"));
    write(root, "src/store/db.ts", "export const db = 1;\n");
    write(
      root,
      `.archify/${RUN}/candidate.json`,
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
