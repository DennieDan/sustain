// ARC-04: Write Architecture Notes for Agents merges the block into AGENTS.md and into a CLAUDE.md
// that does not import it, each after its diff and a yes, and a second run finds nothing to change.
import * as assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { NOTES_END, NOTES_START } from "../../../src/model/agentNotes";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

const RUN = "architecture-notes-20261019-000000";

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

suite("ARC-04 architecture notes for agents", () => {
  let root: string;
  let ui: UiStubs;

  suiteSetup(async () => {
    await vscode.extensions.getExtension("sustain.sustain")!.activate();
  });

  setup(() => {
    ui = stubUi();
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(
      root,
      `.archify/${RUN}/candidate.sir`,
      JSON.stringify({
        meta: { title: "Notes" },
        components: [
          { id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1 }] },
          { id: "store", type: "database", label: "Store" },
        ],
        connections: [{ from: "api", to: "store", label: "saves" }],
      }),
    );
    write(root, "sustain.config.json", JSON.stringify({ map: RUN, rules: [{ id: "store-alone", kind: "isolated", from: "store", to: "api", reason: "Only the API saves." }] }));
    write(root, "AGENTS.md", "# Agents\n\nRun the tests before you push.\n");
    write(root, "CLAUDE.md", "# Claude\n\nKeep answers short.\n");
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const rel of [".archify", "sustain.config.json", "AGENTS.md", "CLAUDE.md"]) rmSync(join(root, rel), { recursive: true, force: true });
  });

  test("ARC-04 the block goes into AGENTS.md and CLAUDE.md after their diffs, with the people's text kept, and once only", async () => {
    ui.answers.warning.push("Write", "Write");
    await vscode.commands.executeCommand("sustain.writeAgentNotes");
    assert.deepEqual(ui.warnings.map((call) => call.message), ["Write the architecture notes into AGENTS.md?", "Write the architecture notes into CLAUDE.md?"]);
    for (const [name, own] of [["AGENTS.md", "# Agents\n\nRun the tests before you push.\n"], ["CLAUDE.md", "# Claude\n\nKeep answers short.\n"]] as const) {
      const text = readFileSync(join(root, name), "utf8");
      assert.ok(text.startsWith(`${own}\n${NOTES_START}\n`), name);
      assert.ok(text.endsWith(`${NOTES_END}\n`), name);
      assert.ok(text.includes("- **API**: backend. Code: `src/api/handler.ts`."), name);
      assert.ok(text.includes("- API uses Store (saves)."), name);
      assert.ok(text.includes("- Only API may import Store. Only the API saves."), name);
    }

    await vscode.commands.executeCommand("sustain.writeAgentNotes");
    assert.equal(ui.warnings.length, 2, "nothing more to ask");
    assert.ok(ui.infos.some((call) => call.message === "The architecture notes for agents are up to date."));
  });

  test("ARC-04 a CLAUDE.md that imports AGENTS.md is left alone, and a no writes nothing", async () => {
    write(root, "CLAUDE.md", "@AGENTS.md\n");
    ui.answers.warning.push("Write");
    await vscode.commands.executeCommand("sustain.writeAgentNotes");
    assert.deepEqual(ui.warnings.map((call) => call.message), ["Write the architecture notes into AGENTS.md?"]);
    assert.ok(readFileSync(join(root, "AGENTS.md"), "utf8").includes(NOTES_START));
    assert.equal(readFileSync(join(root, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");

    write(root, "AGENTS.md", "# Agents\n");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.writeAgentNotes");
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "# Agents\n");
  });
});
