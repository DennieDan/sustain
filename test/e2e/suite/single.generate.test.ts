// FR-GEN-01 (and FR-WS-01's single-folder case) in a single-folder workspace.
import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

/** Folder holding executable stub CLIs that just wait, so the terminal stays open. */
function stubBin(...names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "sustain-bin-"));
  for (const name of names) {
    const path = join(dir, name);
    writeFileSync(path, "#!/bin/sh\nsleep 30\n");
    chmodSync(path, 0o755);
  }
  return dir;
}

function nextTerminal(): Promise<vscode.Terminal> {
  const { promise, resolve } = Promise.withResolvers<vscode.Terminal>();
  const subscription = vscode.window.onDidOpenTerminal((terminal) => {
    subscription.dispose();
    resolve(terminal);
  });
  return promise;
}

suite("FR-GEN-01 Generate Architecture", () => {
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let opened: vscode.Terminal[];
  let listener: vscode.Disposable;
  const cleanup: string[] = [];

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    opened = [];
    listener = vscode.window.onDidOpenTerminal((terminal) => opened.push(terminal));
    // Pretend the skill is installed so the flow goes straight to the focus prompt.
    mkdirSync(join(root, ".agents/skills/sustain-architecture"), { recursive: true });
    writeFileSync(join(root, ".agents/skills/sustain-architecture/SKILL.md"), "---\nname: sustain-architecture\n---\n");
    // No previous diagram unless a test adds one, so the update/regenerate pick is skipped.
    rmSync(join(root, ".archify"), { recursive: true, force: true });
  });

  teardown(() => {
    ui.restore();
    process.env["PATH"] = savedPath;
    listener.dispose();
    for (const terminal of opened) terminal.dispose();
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    rmSync(join(root, ".claude"), { recursive: true, force: true });
    rmSync(join(root, ".archify"), { recursive: true, force: true });
  });

  test("Claude Code: the terminal runs the resolved CLI with the prompt as its argument", async () => {
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("  Payment flow ");
    ui.answers.quickPick.push("Claude Code");
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const terminal = await opened;

    assert.deepEqual(ui.inputBoxes, [{ prompt: "Focus (optional)" }]);
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => item.label),
      ["Claude Code", "Codex"],
    );
    assert.equal(terminal.name, "Sustain: Claude Code");
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.equal(options.shellPath, join(bin, "claude"));
    assert.equal(options.cwd, root);
    assert.deepEqual(options.shellArgs, ["/sustain-architecture Payment flow"]);
    assert.equal(ui.warnings.length, 0);
  });

  test("Codex with an empty focus: `$sustain-architecture` without a trailing space", async () => {
    const bin = stubBin("codex");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("");
    ui.answers.quickPick.push("Codex");
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const terminal = await opened;
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.equal(terminal.name, "Sustain: Codex");
    assert.equal(options.shellPath, join(bin, "codex"));
    assert.deepEqual(options.shellArgs, ["$sustain-architecture"]);
  });

  test("a missing CLI shows the warning and Copy prompt copies the prompt", async () => {
    const empty = stubBin();
    cleanup.push(empty);
    process.env["PATH"] = empty;
    ui.answers.inputBox.push("auth");
    ui.answers.quickPick.push("Claude Code");
    ui.answers.warning.push("Copy prompt");
    await vscode.env.clipboard.writeText("unchanged");
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.warnings.length, 1);
    assert.equal(ui.warnings[0]!.message, "`claude` was not found on PATH.");
    assert.deepEqual(ui.warnings[0]!.rest, ["Copy prompt"]);
    assert.equal(await vscode.env.clipboard.readText(), "/sustain-architecture auth");
    assert.equal(opened.length, 0);
  });

  test("dismissing the focus prompt stops before the agent pick", async () => {
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.quickPicks.length, 0);
    assert.equal(opened.length, 0);
  });

  /** Writes a previous diagram candidate so the update/regenerate pick appears (FR-UPD-08). */
  function addCandidate(): void {
    const dir = join(root, ".archify/architecture-x-20260101-000000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "candidate.sir"), "{}\n");
  }

  test("FR-UPD-08: with a previous diagram, Regenerate from scratch adds `--regenerate`", async () => {
    addCandidate();
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("Payment flow");
    ui.answers.quickPick.push("Regenerate from scratch", "Claude Code");
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const terminal = await opened;
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => item.label),
      ["Update the latest diagram", "Regenerate from scratch"],
    );
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.deepEqual(options.shellArgs, ["/sustain-architecture --regenerate Payment flow"]);
  });

  test("FR-UPD-08: with a previous diagram, Update the latest diagram keeps the prompt", async () => {
    addCandidate();
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("Payment flow");
    ui.answers.quickPick.push("Update the latest diagram", "Claude Code");
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const terminal = await opened;
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.deepEqual(options.shellArgs, ["/sustain-architecture Payment flow"]);
  });

  test("FR-UPD-08: dismissing the update/regenerate pick stops before the agent pick", async () => {
    addCandidate();
    ui.answers.inputBox.push("Payment flow");
    ui.answers.quickPick.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.quickPicks.length, 1);
    assert.deepEqual(
      ui.quickPicks[0]!.map((item) => item.label),
      ["Update the latest diagram", "Regenerate from scratch"],
    );
    assert.equal(opened.length, 0);
  });

  test("without the skill it offers to install first; Install installs and continues", async () => {
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    ui.answers.info.push("Install");
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.infos[0]!.message, "Install the sustain-architecture skill first?");
    assert.deepEqual(ui.infos[0]!.rest, ["Install", "Cancel"]);
    assert.ok(existsSync(join(root, ".agents/skills/sustain-architecture/SKILL.md")));
    assert.equal(ui.inputBoxes.length, 1, "the flow continued to the focus prompt");
  });

  test("without the skill, Cancel stops and installs nothing", async () => {
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    ui.answers.info.push("Cancel");
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(existsSync(join(root, ".agents")), false);
    assert.equal(ui.inputBoxes.length, 0);
  });
});
