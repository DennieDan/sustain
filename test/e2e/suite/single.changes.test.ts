// FRS-04 and SAF-07: Show Changes marks the boxes a diff touches in a real git repository, and a
// repository's core.fsmonitor program never runs while it does.
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-changes-20261018-120000";
const SOURCE = ["import x from 'x';", "", "export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

function write(root: string, rel: string, content: string): string {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "core.fsmonitor=false", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

suite("FRS-04 change overlay", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    write(root, "src/a.ts", SOURCE);
    write(root, "src/b.ts", "notes\n");
    write(
      root,
      `.archify/${RUN}/candidate.json`,
      JSON.stringify({
        components: [
          { id: "handler", type: "backend", label: "Handler", sources: [{ path: "src/a.ts", line: 3, end_line: 6 }] },
          { id: "imports", type: "backend", label: "Imports", sources: [{ path: "src/a.ts", line: 1 }] },
          { id: "docs", type: "external", label: "Docs", sources: [{ path: "src/b.ts" }] },
        ],
      }),
    );
    git(root, "init", "-q");
    git(root, "add", ".");
    git(root, "commit", "-qm", "map");
  });

  teardown(async () => {
    ui.restore();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    for (const dir of [".archify", "src", ".git", "new.ts", "fsmonitor-ran"]) rmSync(join(root, dir), { recursive: true, force: true });
  });

  test("FRS-04 uncommitted changes mark the touched box strong, its neighbour weak and list the new file", async () => {
    write(root, "src/a.ts", SOURCE.replace("parse(req)", "parseJson(req)"));
    write(root, "new.ts", "export {};\n");
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => hook.panelState().open, "the map");
    ui.answers.quickPick.push("Uncommitted changes");
    await vscode.commands.executeCommand("sustain.showChanges");
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => item.label),
      ["Uncommitted changes", "This branch", "Commit range…"],
    );
    assert.deepEqual(hook.panelChanges(), { scope: "Uncommitted changes", strong: ["handler"], weak: ["imports"], uncovered: ["new.ts"] });

    await hook.postFromWebview({ type: "clearChanges" });
    assert.equal(hook.panelChanges(), null);
  });

  test("FRS-04 a commit range compares two commits", async () => {
    write(root, "src/b.ts", "other notes\n");
    git(root, "commit", "-qam", "docs");
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => hook.panelState().open, "the map");
    ui.answers.quickPick.push("Commit range…");
    ui.answers.inputBox.push("HEAD~1..HEAD");
    await vscode.commands.executeCommand("sustain.showChanges");
    assert.deepEqual(hook.panelChanges(), { scope: "Commit range", strong: ["docs"], weak: [], uncovered: [] });
  });

  test("SAF-07 a repository's core.fsmonitor program never runs", async () => {
    const marker = join(root, "fsmonitor-ran");
    const hookScript = write(root, ".git/fsmonitor.sh", `#!/bin/sh\ntouch "${marker}"\n`);
    chmodSync(hookScript, 0o755);
    git(root, "config", "core.fsmonitor", hookScript);
    write(root, "src/a.ts", `${SOURCE}// more\n`);
    await vscode.commands.executeCommand("sustain.openArchitecture");
    await until(() => hook.panelState().open, "the map");
    ui.answers.quickPick.push("Uncommitted changes");
    await vscode.commands.executeCommand("sustain.showChanges");
    assert.ok(hook.panelChanges() !== null);
    assert.equal(existsSync(marker), false);
  });
});
