// PRC-02: Review changes on a temporary repository branch lists the new box candidates, draws
// them on the map, launches a refresh limited to a candidate, and writes Ignore into the config.
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const RUN = "architecture-review-20261018-120000";

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

function nextTerminal(): Promise<vscode.Terminal> {
  const { promise, resolve } = Promise.withResolvers<vscode.Terminal>();
  const subscription = vscode.window.onDidOpenTerminal((terminal) => {
    subscription.dispose();
    resolve(terminal);
  });
  return promise;
}

suite("PRC-02 Review changes", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  const cleanup: string[] = [];
  const terminals: vscode.Terminal[] = [];

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    const bin = mkdtempSync(join(tmpdir(), "sustain-bin-"));
    cleanup.push(bin);
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n");
    chmodSync(join(bin, "claude"), 0o755);
    process.env["PATH"] = `${bin}:${savedPath}`;
    const extensionPath = vscode.extensions.getExtension("sustain.sustain")!.extensionPath;
    for (const name of ["sustain-architecture", "sustain-refresh"]) writeSkill(homedir(), join(extensionPath, "dist/skills", name), skillTargets(homedir(), name), name);
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", "terminal", vscode.ConfigurationTarget.Global);

    write(root, "src/api/handler.ts", "export const handle = () => save();\n");
    write(root, `.archify/${RUN}/candidate.json`, JSON.stringify({ meta: { title: "Shop" }, components: [{ id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1 }] }] }));
    git(root, "init", "-q");
    git(root, "add", "-f", ".");
    git(root, "commit", "-qm", "map");
    git(root, "checkout", "-qb", "feature");
    for (const name of ["a", "b", "c"]) write(root, `src/payments/${name}.ts`, `export const ${name} = 1;\n`);
    git(root, "add", ".");
    git(root, "commit", "-qm", "payments");
  });

  teardown(async () => {
    ui.restore();
    process.env["PATH"] = savedPath;
    for (const terminal of terminals.splice(0)) terminal.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const path of [".archify", "src", ".git", "sustain.config.json"]) rmSync(join(root, path), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  async function reviewBranch(): Promise<void> {
    ui.answers.quickPick.push("This branch");
    await vscode.commands.executeCommand("sustain.reviewChanges");
    await until(() => hook.reviewReport() !== null, "the review");
  }

  test("PRC-02 the branch's new folder is listed and drawn as a ghost box", async () => {
    await reviewBranch();
    assert.deepEqual(
      hook.reviewReport()!.candidates.map((candidate) => [candidate.dir, candidate.files.length]),
      [["src/payments", 3]],
    );
    await until(() => hook.panelGhosts()?.length === 1, "the ghost box");
    assert.deepEqual(hook.panelGhosts(), [{ label: "payments", files: 3 }]);
  });

  test("PRC-02 Add to map launches a refresh limited to the candidate's folder", async () => {
    await reviewBranch();
    const opened = nextTerminal();
    await hook.postFromHome({ type: "addToMap", dir: "src/payments" });
    const terminal = await opened;
    terminals.push(terminal);
    assert.deepEqual((terminal.creationOptions as vscode.TerminalOptions).shellArgs, [`/sustain-refresh --from ${RUN} --paths src/payments`]);
  });

  test("PRC-02 Ignore shows the change, writes the config and drops the candidate", async () => {
    await reviewBranch();
    ui.answers.warning.push("Ignore");
    await hook.postFromHome({ type: "ignoreCandidate", dir: "src/payments" });
    assert.equal(ui.warnings[0]?.message, "Ignore src/payments/ in sustain.config.json?");
    assert.deepEqual(JSON.parse(readFileSync(join(root, "sustain.config.json"), "utf8")), { ignore: ["src/payments/**"] });
    assert.deepEqual(hook.reviewReport()!.candidates, []);
    assert.ok(vscode.window.tabGroups.all.flatMap((group) => group.tabs).some((tab) => tab.label.startsWith("sustain.config.json: ignore src/payments/")), "the diff was shown");
  });
});
