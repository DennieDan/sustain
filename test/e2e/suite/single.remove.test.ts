// SAF-08: Remove Sustain from This Folder removes the repository's skills, hook entries, exclude lines
// and the AGENTS.md block, deletes the maps, sessions and config only when asked, and offers to
// remove the per-user skills.
import * as assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import { ensureGitExclude, mergeAgentHooks, mergeHooks } from "../../../src/extension/hooksFiles";
import { skillTargets, writeSkill } from "../../../src/core-node/skillFiles";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

suite("SAF-08 Remove Sustain from a folder", () => {
  let ui: UiStubs;
  let root: string;

  setup(async () => {
    await vscode.extensions.getExtension("sustain.sustain")!.activate();
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    const dist = join(vscode.extensions.getExtension("sustain.sustain")!.extensionPath, "dist/skills");
    for (const base of [root, homedir()]) writeSkill(base, join(dist, "sustain-architecture"), skillTargets(base, "sustain-architecture"), "sustain-architecture");
    mkdirSync(join(root, ".git/info"), { recursive: true });
    write(root, ".git/info/exclude", "*.log\n");
    ensureGitExclude(root);
    mergeHooks(root);
    write(root, ".claude/settings.local.json", `${JSON.stringify({ permissions: { allow: ["Bash(npm test)"] } })}\n`);
    mergeAgentHooks(root, "claude", 'node "/x/.agents/skills/sustain-bugfix/scripts/session-hook.mjs"');
    write(root, "AGENTS.md", "# Team notes\n\nKeep tests green.\n\n<!-- sustain:architecture:start -->\nBoxes.\n<!-- sustain:architecture:end -->\n");
    write(root, ".archify/architecture-x-20261019-120000/candidate.json", "{}");
    write(root, ".sustain/active", "bugfix-x-20261019-120000\n");
    write(root, "sustain.config.json", "{}\n");
  });

  teardown(async () => {
    ui.restore();
    for (const path of [".agents", ".claude", ".devin", ".git", ".archify", ".sustain", "AGENTS.md", "sustain.config.json"]) rmSync(join(root, path), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("SAF-08 the folder's additions go, the data goes once asked, and the per-user skills once offered", async () => {
    ui.answers.warning.push("Remove", "Delete");
    ui.answers.info.push("Remove from Home");
    await vscode.commands.executeCommand("sustain.removeSustain");
    assert.equal(ui.warnings[0]?.message, `Remove Sustain from ${vscode.workspace.workspaceFolders![0]!.name}?`);
    for (const path of [".agents/skills/sustain-architecture", ".claude/skills/sustain-architecture", ".devin/hooks.v1.json", ".archify", ".sustain", "sustain.config.json"]) assert.equal(existsSync(join(root, path)), false, path);
    assert.deepEqual(JSON.parse(readFileSync(join(root, ".claude/settings.local.json"), "utf8")), { permissions: { allow: ["Bash(npm test)"] } });
    assert.equal(readFileSync(join(root, ".git/info/exclude"), "utf8"), "*.log\n");
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "# Team notes\n\nKeep tests green.\n");
    assert.equal(existsSync(join(homedir(), ".agents/skills/sustain-architecture")), false);
    assert.equal(ui.infos.at(-1)?.message, `Removed Sustain from ${vscode.workspace.workspaceFolders![0]!.name}.`);
  });

  test("SAF-08 declining keeps the maps, sessions and config, and the per-user skills", async () => {
    ui.answers.warning.push("Remove", undefined);
    ui.answers.info.push(undefined);
    await vscode.commands.executeCommand("sustain.removeSustain");
    assert.equal(existsSync(join(root, ".agents/skills/sustain-architecture")), false);
    for (const path of [".archify", ".sustain", "sustain.config.json"]) assert.equal(existsSync(join(root, path)), true, path);
    assert.equal(existsSync(join(homedir(), ".agents/skills/sustain-architecture")), true);
  });
});
