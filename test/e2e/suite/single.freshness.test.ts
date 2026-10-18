// FRS-03: the shown map follows the code. Editing a cited block badges its box within 3 s, the
// status bar and maps list count it, and a moved block opens at its new lines.
import * as assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { fingerprint, writeFingerprints } from "../../../src/model/fingerprints";
import type { ArchifyDoc } from "../../../src/model/types";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { pause } from "../until";

const RUN = "architecture-fresh-20261018-120000";
const SOURCE = ["import x from 'x';", "", "export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

/** Polls `condition` every 50 ms for up to `ms`. */
async function within(ms: number, condition: () => boolean, what: string): Promise<void> {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`not within ${ms} ms: ${what}`);
    await pause(50);
  }
}

suite("FRS-03 freshness on the map", () => {
  let hook: TestHook;
  let root: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    write(root, "src/a.ts", SOURCE);
    write(root, "src/b.ts", "notes\n");
    const doc = {
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "Fresh" },
      components: [
        { id: "api", type: "backend", label: "API", sources: [{ path: "src/a.ts", line: 3, end_line: 6 }] },
        { id: "docs", type: "external", label: "Docs", sources: [{ path: "src/b.ts" }] },
      ],
    };
    const candidate = write(root, `.archify/${RUN}/candidate.json`, JSON.stringify(doc));
    writeFingerprints(root, dirname(candidate), fingerprint(doc as unknown as ArchifyDoc, root, null));
  });

  teardown(async () => {
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const dir of [".archify", "src"]) rmSync(join(root, dir), { recursive: true, force: true });
  });

  test("FRS-03 editing a cited block badges its box within 3 s and the counts follow", async () => {
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await within(3000, () => hook.panelFreshness()?.boxes["api"] === "fresh", "the map to load fresh");
    write(root, "src/a.ts", SOURCE.replace("save(body)", "store(body)"));
    await within(3000, () => hook.panelFreshness()?.boxes["api"] === "edited", "box api to be badged changed");
    assert.equal(hook.panelFreshness()?.boxes["docs"], "fresh");
    await within(1000, () => hook.statusText() === "Sustain: 1 changed", "the status bar count");
    await vscode.commands.executeCommand("workbench.view.extension.sustain");
    await within(3000, () => hook.homeState().visible, "the sidebar to show");
    assert.equal(hook.homeState().state?.maps[0]?.changed, 1);
  });

  test("FRS-03 a moved block opens at its new lines", async () => {
    write(root, "src/a.ts", `// one\n// two\n${SOURCE}`);
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await within(3000, () => hook.panelFreshness()?.boxes["api"] === "moved", "box api to be moved");
    await hook.postFromWebview({ type: "openSource", componentId: "api", index: 0 });
    await within(3000, () => vscode.window.activeTextEditor?.document.uri.fsPath === join(root, "src/a.ts"), "src/a.ts to open");
    const selection = vscode.window.activeTextEditor!.selection;
    assert.deepEqual([selection.start.line, selection.end.line], [4, 7]);
  });
});
