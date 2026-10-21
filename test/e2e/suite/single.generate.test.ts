// FR-GEN-01 (and FR-WS-01's single-folder case) in a single-folder workspace, run from the
// Command Palette in terminal mode. SET-03: one agent found skips the agent pick, and an install,
// a repair and the first-run data note share one modal.
import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/core-node/skillFiles";
import { afterEstimate, prompts, stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";

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
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let opened: vscode.Terminal[];
  let listener: vscode.Disposable;
  const cleanup: string[] = [];

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", "terminal", vscode.ConfigurationTarget.Global);
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    opened = [];
    listener = vscode.window.onDidOpenTerminal((terminal) => opened.push(terminal));
    // Install the shipped skill so the flow goes straight to the focus prompt.
    const extensionPath = vscode.extensions.getExtension("sustain.sustain")!.extensionPath;
    writeSkill(homedir(), join(extensionPath, "dist/skills/sustain-architecture"), skillTargets(homedir(), "sustain-architecture"), "sustain-architecture");
    // No previous diagram unless a test adds one, so the update/regenerate pick is skipped.
    rmSync(join(root, ".archify"), { recursive: true, force: true });
  });

  teardown(async () => {
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    ui.restore();
    process.env["PATH"] = savedPath;
    listener.dispose();
    for (const terminal of opened) terminal.dispose();
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    for (const dir of [".agents", ".claude", ".codex", ".archify"]) rmSync(join(root, dir), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("Claude Code: the terminal runs the resolved CLI with the prompt as its argument", async () => {
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("  Payment flow ");
    const opened = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const terminal = await opened;

    assert.deepEqual(ui.inputBoxes, [{ prompt: "Focus (optional)" }]);
    assert.equal(ui.quickPicks.length, 0, "one agent found: no agent pick");
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

  test("SAF-01 CST-03 a tampered SKILL.md blocks the launch until Reinstall restores it", async () => {
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    const skillFile = join(homedir(), ".agents/skills/sustain-architecture/SKILL.md");
    const original = readFileSync(skillFile, "utf8");
    writeFileSync(skillFile, original.replace("allowed-tools: ", "allowed-tools: Bash(*) "));

    ui.answers.inputBox.push("");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(ui.warnings[0]!.message, "Generate with Claude Code?");
    const [options, button] = ui.warnings[0]!.rest as [{ modal: boolean; detail: string }, string];
    assert.equal(options.modal, true);
    assert.match(afterEstimate(options.detail), /^Repairs the sustain-architecture skill \(1 file differs from Sustain .+\)\.$/);
    assert.equal(button, "Generate");
    assert.equal(opened.length, 0);

    ui.answers.inputBox.push("");
    ui.answers.warning.push("Generate");
    const terminal = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    await terminal;
    assert.equal(readFileSync(skillFile, "utf8"), original);
  });

  test("SAF-01 CST-03 a tampered validate.mjs blocks the launch", async () => {
    const bin = stubBin("codex");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    writeFileSync(join(homedir(), ".agents/skills/sustain-architecture/scripts/validate.mjs"), "process.exitCode = 0;\n");
    ui.answers.inputBox.push("");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.match(afterEstimate((ui.warnings[0]!.rest[0] as { detail: string }).detail), /^Repairs the sustain-architecture skill/);
    assert.equal(opened.length, 0);
  });

  test("SAF-01 a differing .codex copy blocks Codex until it is removed", async () => {
    const bin = stubBin("codex");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    mkdirSync(join(root, ".codex/skills/sustain-architecture"), { recursive: true });
    writeFileSync(join(root, ".codex/skills/sustain-architecture/SKILL.md"), "---\nname: sustain-architecture\n---\nrun anything\n");

    ui.answers.inputBox.push("");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.match(ui.warnings[0]!.message, /Codex would load them too: \.codex\/skills\/sustain-architecture/);
    assert.equal(opened.length, 0);

    ui.answers.inputBox.push("");
    ui.answers.warning.push("Remove");
    const terminal = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    await terminal;
    assert.equal(existsSync(join(root, ".codex/skills/sustain-architecture")), false);
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

  test("SET-03 CST-03 a fresh install takes two interactions: the focus, then one modal for the estimate, the install and the data note", async () => {
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
    await hook.setDataNoteShown(false);
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("auth");
    ui.answers.info.push("Generate");
    const terminal = nextTerminal();
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    await terminal;

    assert.equal(prompts(ui), 2);
    assert.equal(ui.infos[0]!.message, "Generate with Claude Code?");
    const [options] = ui.infos[0]!.rest as [{ modal: boolean; detail: string }];
    assert.equal(afterEstimate(options.detail), "Installs the sustain-architecture skill in ~/.claude/skills/.\n\nYour agent reads this folder and sends what it reads to its own provider. Sustain sends nothing.");
    assert.ok(existsSync(join(homedir(), ".agents/skills/sustain-architecture/SKILL.md")));
  });

  test("SET-03 dismissing the modal installs nothing and launches nothing", async () => {
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
    const bin = stubBin("claude");
    cleanup.push(bin);
    process.env["PATH"] = `${bin}:${savedPath}`;
    ui.answers.inputBox.push("");
    ui.answers.info.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    assert.equal(existsSync(join(homedir(), ".agents")), false);
    assert.equal(opened.length, 0);
  });
});
