// VWR-05: Map This Box in Detail runs Generate on the box with the map it came from, and a
// drill-down map offers Back to overview, which opens that map.
import * as assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const OVERVIEW = "architecture-shop-20261019-120000";
const DETAIL = "architecture-api-20261019-130000";

function write(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
}

suite("VWR-05 Drill down", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  let bin: string;
  const terminals: vscode.Terminal[] = [];

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    bin = mkdtempSync(join(tmpdir(), "sustain-bin-"));
    writeFileSync(join(bin, "claude"), "#!/bin/sh\nsleep 30\n");
    chmodSync(join(bin, "claude"), 0o755);
    savedPath = process.env["PATH"];
    process.env["PATH"] = `${bin}:${savedPath}`;
    writeSkill(homedir(), join(vscode.extensions.getExtension("sustain.sustain")!.extensionPath, "dist/skills/sustain-architecture"), skillTargets(homedir(), "sustain-architecture"), "sustain-architecture");
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", "terminal", vscode.ConfigurationTarget.Global);
    write(root, "src/api.ts", "export const api = () => 1;\n");
    const map = (components: object[]): string => JSON.stringify({ meta: { title: "Shop" }, components });
    write(root, `.archify/${OVERVIEW}/candidate.json`, map([{ id: "api", type: "backend", label: "Orders API", sources: [{ path: "src/api.ts", line: 1 }] }]));
    write(root, `.archify/${DETAIL}/candidate.json`, map([{ id: "handler", type: "backend", label: "Handler", sources: [{ path: "src/api.ts", line: 1 }] }]));
    write(root, `.archify/${DETAIL}/run.json`, JSON.stringify({ schema: 1, kind: "drill", focus: "Orders API", paths: [], base: null, parent: OVERVIEW, createdAt: "2026-10-19T13:00:00Z", skillVersion: "test", phase: "accepted", attempts: 1 }));
  });

  teardown(async () => {
    ui.restore();
    process.env["PATH"] = savedPath;
    for (const terminal of terminals.splice(0)) terminal.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    for (const path of [".archify", "src"]) rmSync(join(root, path), { recursive: true, force: true });
    rmSync(bin, { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("VWR-05 Map This Box in Detail runs Generate on the box with the map it came from", async () => {
    await hook.postFromHome({ type: "openMap", file: join(root, ".archify", OVERVIEW, "candidate.json") });
    await until(() => hook.panelState().file === join(root, ".archify", OVERVIEW, "candidate.json"), "the overview to open");
    const opened = new Promise<vscode.Terminal>((resolve) => {
      const subscription = vscode.window.onDidOpenTerminal((terminal) => {
        subscription.dispose();
        resolve(terminal);
      });
    });
    await vscode.commands.executeCommand("sustain.drillDown", { componentId: "api" });
    const terminal = await opened;
    terminals.push(terminal);
    assert.deepEqual((terminal.creationOptions as vscode.TerminalOptions).shellArgs, [`/sustain-architecture Orders API --parent ${OVERVIEW}`]);
  });

  test("VWR-05 a drill-down map offers Back to overview, which opens the map it came from", async () => {
    await hook.postFromHome({ type: "openMap", file: join(root, ".archify", DETAIL, "candidate.json") });
    await until(() => hook.panelOverview() === OVERVIEW, "the drill-down to know its overview");
    await hook.postFromWebview({ type: "backToOverview" });
    await until(() => hook.panelState().file === join(root, ".archify", OVERVIEW, "candidate.json"), "the overview to open");
    assert.equal(hook.panelOverview(), null);
  });
});
