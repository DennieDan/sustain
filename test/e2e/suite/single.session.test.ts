// The learning-session launcher + panel in a single-folder workspace (ADRs 0034/0036/0040):
// install prompt → mode pick → task input → hooks merge → `devin -- /sustain-bugfix <task>`
// terminal → session panel.
import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/vscode/extension";
import { mergeHooks } from "../../../src/extension/hooksFiles";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";
import { pause, until } from "../until";

const HOOKS = join(".devin", "hooks.v1.json");

suite("Learning session launcher", () => {
  let ui: UiStubs;
  let hook: TestHook;
  let root: string;
  let savedPath: string | undefined;
  let savedCreateTerminal: typeof vscode.window.createTerminal;
  /** `createTerminal` options — a real one would spawn `devin` inside the test host. */
  let terminals: (vscode.TerminalOptions | string)[];

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    terminals = [];
    savedCreateTerminal = vscode.window.createTerminal;
    (vscode.window as { createTerminal: unknown }).createTerminal = (options: vscode.TerminalOptions | string) => {
      terminals.push(options);
      return { show: () => undefined, dispose: () => undefined };
    };
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
    // A fake `devin` on PATH makes detection deterministic wherever the suite runs.
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const devin = join(bin, "devin");
    writeFileSync(devin, "#!/bin/sh\n");
    chmodSync(devin, 0o755);
    savedPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${savedPath ?? ""}`;
  });

  teardown(() => {
    ui.restore();
    vscode.window.createTerminal = savedCreateTerminal;
    if (savedPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = savedPath;
    for (const dir of ["bin", ".agents", ".claude", ".devin", ".sustain"]) rmSync(join(root, dir), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
    rmSync(join(root, ".gitignore"), { force: true });
  });

  test("declining the skill install stops before any other prompt", async () => {
    ui.answers.info.push(undefined); // "Install the Sustain skills first?" → dismiss
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.infos.length, 1);
    assert.match(ui.infos[0]!.message, /Install the Sustain skills first/);
    assert.equal(ui.quickPicks.length, 0);
    assert.equal(terminals.length, 0);
    assert.equal(hook.sessionPanelState().open, false);
  });

  test("dismissing the mode pick or an empty task stops without a terminal", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    ui.answers.quickPick.push(undefined);
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.quickPicks.length, 1);
    assert.equal(ui.inputBoxes.length, 0);
    assert.equal(terminals.length, 0);

    ui.answers.quickPick.push("Bug hunt");
    ui.answers.inputBox.push(undefined);
    await vscode.commands.executeCommand("sustain.startLearning");
    assert.equal(ui.inputBoxes.length, 1);
    assert.equal(terminals.length, 0);
  });

  test("the happy path installs, merges hooks, launches devin and opens the panel", async () => {
    ui.answers.info.push("Install"); // skill missing → install it
    ui.answers.quickPick.push("Bug hunt");
    ui.answers.inputBox.push("add a helper");
    await vscode.commands.executeCommand("sustain.startLearning");

    assert.ok(existsSync(join(homedir(), ".agents/skills/sustain-bugfix/SKILL.md")), "skill installed in the home folder");
    assert.match(readFileSync(join(root, HOOKS), "utf8"), /\.agents\/skills\/sustain-bugfix\/scripts\/session-hook\.mjs/);
    assert.ok(existsSync(join(root, HOOKS)), "hooks merged");
    assert.equal(terminals.length, 1);
    const options = terminals[0] as vscode.TerminalOptions;
    assert.equal(options.name, "Sustain: Bug hunt");
    assert.match(String(options.shellPath), /devin$/);
    assert.deepEqual(options.shellArgs, ["--", "/sustain-bugfix add a helper"]);
    assert.equal(String(options.cwd), root);
    assert.equal(hook.sessionPanelState().open, true);
    await hook.postFromSessionWebview({ type: "ready" }); // host re-sends the view; must not throw
  });

  test("LRN-01 a session in Claude Code merges its hooks into the local settings, launches claude with the skill, and the hooks go with the lock", async () => {
    const claude = join(root, "bin", "claude");
    writeFileSync(claude, "#!/bin/sh\n");
    chmodSync(claude, 0o755);
    await vscode.commands.executeCommand("sustain.installSkills");
    ui.answers.quickPick.push("Bug hunt", "Claude Code");
    ui.answers.inputBox.push("add a helper");
    await vscode.commands.executeCommand("sustain.startLearning");

    const settings = JSON.parse(readFileSync(join(root, ".claude/settings.local.json"), "utf8")) as { hooks: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] } };
    assert.equal(settings.hooks.PreToolUse[0]!.matcher, "Edit|Write|NotebookEdit|Agent");
    assert.match(settings.hooks.PreToolUse[0]!.hooks[0]!.command, /\.agents\/skills\/sustain-bugfix\/scripts\/session-hook\.mjs"$/);
    assert.equal(existsSync(join(root, HOOKS)), false, "Devin gets no entry in a Claude Code session");
    assert.equal(terminals.length, 1);
    const options = terminals[0] as vscode.TerminalOptions;
    assert.equal(String(options.shellPath), claude);
    assert.deepEqual(options.shellArgs, ["/sustain-bugfix add a helper"]);

    mkdirSync(join(root, ".sustain"), { recursive: true });
    writeFileSync(join(root, ".sustain/active"), "bugfix-demo-20261019-120000\n");
    await pause(800);
    assert.ok(existsSync(join(root, ".claude/settings.local.json")), "hooks kept while the lock exists");
    rmSync(join(root, ".sustain/active"));
    await until(() => !existsSync(join(root, ".claude/settings.local.json")), "the Claude Code hooks removed after the lock went");
  });

  test("SAF-06 the session's hook entries go when its lock goes", async () => {
    mkdirSync(join(root, ".sustain"), { recursive: true });
    writeFileSync(join(root, ".sustain/active"), "bugfix-demo-20261018-120000\n");
    mergeHooks(root);
    await pause(800); // the watcher sees the lock appear and keeps the hooks
    assert.ok(existsSync(join(root, HOOKS)), "hooks kept while the lock exists");
    rmSync(join(root, ".sustain/active"));
    await until(() => !existsSync(join(root, HOOKS)), "hooks removed after the lock went");
  });
});
