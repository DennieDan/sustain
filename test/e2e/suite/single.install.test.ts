// FR-INS-01 in a single-folder workspace: every skill, and since spec v0.3 SAF-06 no hooks
// and no .gitignore line at install time.
import * as assert from "node:assert/strict";
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

const HOOKS = join(".devin", "hooks.v1.json");

suite("FR-INS-01 Install Agent Skills", () => {
  let ui: UiStubs;
  let root: string;
  let home: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    home = homedir();
    ui = stubUi();
  });

  teardown(() => {
    ui.restore();
    for (const dir of [".agents", ".claude", ".devin", ".sustain"]) rmSync(join(root, dir), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(home, dir), { recursive: true, force: true });
    rmSync(join(root, ".gitignore"), { force: true });
  });

  test("SAF-06 FRS-05 ACC-05 a fresh install copies every skill, links .claude and leaves .devin and .gitignore alone", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    for (const file of ["SKILL.md", "agents/openai.yaml", "references/archify-format.md", "references/example.json", "scripts/validate.mjs", "scripts/repo-facts.mjs"]) {
      assert.ok(existsSync(join(home, ".agents/skills/sustain-architecture", file)), file);
    }
    for (const file of ["SKILL.md", "agents/openai.yaml", "references/bug-taxonomy.md", "scripts/session.mjs", "scripts/session-hook.mjs"]) {
      assert.ok(existsSync(join(home, ".agents/skills/sustain-bugfix", file)), file);
    }
    for (const file of ["SKILL.md", "agents/openai.yaml", "references/archify-format.md", "scripts/refresh-facts.mjs", "scripts/validate.mjs"]) {
      assert.ok(existsSync(join(home, ".agents/skills/sustain-refresh", file)), file);
    }
    for (const file of ["SKILL.md", "agents/openai.yaml", "scripts/audit-record.mjs"]) {
      assert.ok(existsSync(join(home, ".agents/skills/sustain-audit", file)), file);
    }
    for (const name of ["sustain-architecture", "sustain-audit", "sustain-bugfix", "sustain-refresh"]) {
      const link = join(home, ".claude/skills", name);
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.equal(readlinkSync(link), `../../.agents/skills/${name}`);
      assert.ok(existsSync(join(link, "SKILL.md")), "link resolves to the skill");
    }
    assert.equal(existsSync(join(root, HOOKS)), false, "no hooks at install");
    assert.equal(existsSync(join(root, ".gitignore")), false, "no .gitignore at install");
    assert.equal(ui.warnings.length, 0, "no overwrite prompt on a fresh install");
    assert.equal(ui.infos.length, 1);
    assert.match(ui.infos[0]!.message, /~\/\.agents\/skills\//);
    assert.doesNotMatch(ui.infos[0]!.message, /hooks/);
  });

  test("ACC-05 an existing install is replaced after Overwrite", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    const marker = join(home, ".agents/skills/sustain-architecture/marker.txt");
    writeFileSync(marker, "old");
    ui.answers.warning.push("Overwrite");
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(ui.warnings[0]!.message, "Overwrite the existing sustain-architecture, sustain-audit, sustain-bugfix and sustain-refresh skills?");
    assert.deepEqual(ui.warnings[0]!.rest, [{ modal: true }, "Overwrite"]);
    assert.equal(existsSync(marker), false, "overwrite removes the old install first");
    assert.equal(lstatSync(join(home, ".claude/skills/sustain-architecture")).isSymbolicLink(), true);
    assert.equal(ui.infos.length, 2);
  });

  test("Cancel leaves an existing install untouched", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    const marker = join(home, ".agents/skills/sustain-architecture/marker.txt");
    writeFileSync(marker, "old");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(existsSync(marker), true);
    assert.equal(ui.infos.length, 1, "only the first install reported success");
  });

  test("a lone .claude entry also triggers the overwrite prompt", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    rmSync(join(home, ".agents"), { recursive: true, force: true });
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(existsSync(join(home, ".agents")), false, "cancel changed nothing");
  });

  test("SET-01 with sustain.skillScope set to project the skills go into the repository", async () => {
    const config = vscode.workspace.getConfiguration("sustain");
    await config.update("skillScope", "project", vscode.ConfigurationTarget.Global);
    try {
      await vscode.commands.executeCommand("sustain.installSkills");
      assert.ok(existsSync(join(root, ".agents/skills/sustain-architecture/SKILL.md")));
      assert.equal(lstatSync(join(root, ".claude/skills/sustain-architecture")).isSymbolicLink(), true);
      assert.equal(existsSync(join(home, ".agents")), false);
      assert.match(ui.infos[0]!.message, /in \.agents\/skills\//);
    } finally {
      await config.update("skillScope", undefined, vscode.ConfigurationTarget.Global);
    }
  });
});
