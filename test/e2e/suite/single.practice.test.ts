// SKL-01: the explain-back in the sidebar, with a stub agent on PATH that replays recorded streams
// (test/fixtures/streams/stub-agent.mjs) on a temporary git repository with an uncommitted change.
import * as assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

function extensionPath(): string {
  return vscode.extensions.getExtension("sustain.sustain")!.extensionPath;
}

function git(root: string, ...args: string[]): void {
  const result = spawnSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
}

suite("SKL-01 Explain-back", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let scratch: string;

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    scratch = mkdtempSync(join(tmpdir(), "sustain-practice-"));
    const stub = join(extensionPath(), "test/fixtures/streams/stub-agent.mjs");
    writeFileSync(join(scratch, "claude"), `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${stub}" "$@"\n`);
    chmodSync(join(scratch, "claude"), 0o755);
    process.env["PATH"] = `${scratch}:${savedPath}`;
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/pay.ts"), "export function pay(amount: number) {\n  return amount;\n}\n");
    git(root, "init", "-q");
    git(root, "add", "src");
    git(root, "commit", "-qm", "pay");
    writeFileSync(join(root, "src/pay.ts"), "export function pay(amount: number) {\n  return amount * 2;\n}\n");
    await vscode.commands.executeCommand("workbench.view.extension.sustain");
    await until(() => hook.homeState().visible, "the sidebar to show");
    await hook.postFromHome({ type: "practiceClear" });
  });

  teardown(async () => {
    ui.restore();
    process.env["PATH"] = savedPath;
    for (const name of ["SUSTAIN_STUB_STREAM", "SUSTAIN_STUB_ARGS"]) delete process.env[name];
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await hook.postFromHome({ type: "practiceClear" });
    for (const path of ["src", ".git"]) rmSync(join(root, path), { recursive: true, force: true });
    rmSync(scratch, { recursive: true, force: true });
  });

  test("SKL-01 the agent's questions reach the sidebar without their keys, and an answer comes back graded with a link that opens the code", async () => {
    const args = join(scratch, "args.json");
    Object.assign(process.env, { SUSTAIN_STUB_STREAM: join(extensionPath(), "test/fixtures/streams/claude-practice-questions.jsonl"), SUSTAIN_STUB_ARGS: args });
    await hook.postFromHome({ type: "practiceStart", scope: "uncommitted" });
    const asked = JSON.parse(readFileSync(args, "utf8")) as string[];
    assert.match(asked[1]!, /^Check that the user understands the uncommitted changes\. The code is here:\n- src\/pay\.ts, line 2\n/);
    assert.deepEqual(asked.slice(asked.indexOf("--allowedTools") + 1), ["Read", "Grep", "Glob"]);
    const check = hook.homeState().state!.practice.check!;
    assert.deepEqual([check.scope, check.status], ["Uncommitted changes", "done"]);
    assert.deepEqual(
      check.questions.map((entry) => entry.question),
      ["Why does pay double the amount before charging?", "What happens when the charge fails?", "Which value does pay return?"],
    );
    assert.equal(JSON.stringify(hook.homeState().state).includes("KEY-"), false, "no expected answer reaches the sidebar");

    Object.assign(process.env, { SUSTAIN_STUB_STREAM: join(extensionPath(), "test/fixtures/streams/claude-practice-grade.jsonl") });
    await hook.postFromHome({ type: "practiceAnswer", index: 0, answer: "It doubles the amount." });
    const graded = JSON.parse(readFileSync(args, "utf8")) as string[];
    assert.match(graded[1]!, /Expected answer: KEY-ONE: the amount is in cents and the fee doubles it\.\n/);
    assert.match(graded[1]!, /<answer>\nIt doubles the amount\.\n<\/answer>/);
    const question = hook.homeState().state!.practice.check!.questions[0]!;
    assert.deepEqual([question.status, question.answer, question.grade?.grade, question.grade?.cite?.text], ["graded", "It doubles the amount.", "correct", "src/pay.ts:2"]);

    await hook.postFromHome({ type: "openCitation", path: "src/pay.ts", line: 2, endLine: null });
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === join(root, "src/pay.ts"), "src/pay.ts to open");
    assert.equal(vscode.window.activeTextEditor!.selection.start.line, 1);
  });
});
