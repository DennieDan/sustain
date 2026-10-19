// FR-INS-01 in a single-folder workspace.
import * as assert from "node:assert/strict";
import { existsSync, lstatSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as vscode from "vscode";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, teardown, test } from "../tdd";

suite("FR-INS-01 Install Agent Skills", () => {
  let ui: UiStubs;
  let root: string;

  setup(() => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
  });

  teardown(() => {
    ui.restore();
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    rmSync(join(root, ".claude"), { recursive: true, force: true });
  });

  test("a fresh install copies the skill and links .claude to it", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    for (const file of ["SKILL.md", "agents/openai.yaml", "references/archify-format.md", "references/example.json", "scripts/validate.mjs", "scripts/repo-facts.mjs", "scripts/change-map.mjs", "scripts/match-ids.mjs"]) {
      assert.ok(existsSync(join(root, ".agents/skills/sustain-architecture", file)), file);
    }
    const link = join(root, ".claude/skills/sustain-architecture");
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.equal(readlinkSync(link), "../../.agents/skills/sustain-architecture");
    assert.ok(existsSync(join(link, "SKILL.md")), "link resolves to the skill");
    assert.equal(ui.warnings.length, 0, "no overwrite prompt on a fresh install");
    assert.equal(ui.infos.length, 1);
    assert.match(ui.infos[0]!.message, /\.agents\/skills\/sustain-architecture/);
    assert.match(ui.infos[0]!.message, /\.claude\/skills\/sustain-architecture/);
  });

  test("an existing install is replaced after Overwrite", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    const marker = join(root, ".agents/skills/sustain-architecture/marker.txt");
    writeFileSync(marker, "old");
    ui.answers.warning.push("Overwrite");
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(ui.warnings[0]!.message, "Overwrite the existing sustain-architecture skill?");
    assert.deepEqual(ui.warnings[0]!.rest, [{ modal: true }, "Overwrite"]);
    assert.equal(existsSync(marker), false, "overwrite removes the old install first");
    assert.equal(lstatSync(join(root, ".claude/skills/sustain-architecture")).isSymbolicLink(), true);
    assert.equal(ui.infos.length, 2);
  });

  test("Cancel leaves an existing install untouched", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    const marker = join(root, ".agents/skills/sustain-architecture/marker.txt");
    writeFileSync(marker, "old");
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(existsSync(marker), true);
    assert.equal(ui.infos.length, 1, "only the first install reported success");
  });

  test("a lone .claude entry also triggers the overwrite prompt", async () => {
    await vscode.commands.executeCommand("sustain.installSkills");
    rmSync(join(root, ".agents"), { recursive: true, force: true });
    ui.answers.warning.push(undefined);
    await vscode.commands.executeCommand("sustain.installSkills");
    assert.equal(ui.warnings.length, 1);
    assert.equal(existsSync(join(root, ".agents")), false, "cancel changed nothing");
  });
});
