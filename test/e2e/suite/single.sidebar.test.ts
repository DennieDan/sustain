// UI-01, UI-02, UI-04, UI-06, SET-02, SET-03 and CST-04 in a single-folder workspace. The suite posts
// to the sidebar through the test hook as its webview would, with a stub agent on PATH that
// replays recorded streams (test/fixtures/streams/stub-agent.mjs).
import * as assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";
import type { TestHook } from "../../../src/extension/extension";
import { skillTargets, writeSkill } from "../../../src/extension/skillFiles";
import { findOnPath } from "../../../src/model/which";
import { ESTIMATE, prompts, stubUi, type UiStubs } from "../stubs";
import { setup, suite, suiteSetup, teardown, test } from "../tdd";
import { until } from "../until";

const STUB_ENV = ["SUSTAIN_STUB", "SUSTAIN_STUB_STREAM", "SUSTAIN_STUB_CANDIDATE", "SUSTAIN_STUB_DELAY", "SUSTAIN_STUB_ARGS", "SUSTAIN_STUB_PIDS"];

function extensionPath(): string {
  return vscode.extensions.getExtension("sustain.sustain")!.extensionPath;
}

function stream(name: string): string {
  return join(extensionPath(), "test/fixtures/streams", name);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function nextTerminal(): Promise<vscode.Terminal> {
  const { promise, resolve } = Promise.withResolvers<vscode.Terminal>();
  const subscription = vscode.window.onDidOpenTerminal((terminal) => {
    subscription.dispose();
    resolve(terminal);
  });
  return promise;
}

suite("UI-01 Sustain sidebar", () => {
  let hook: TestHook;
  let ui: UiStubs;
  let root: string;
  let savedPath: string | undefined;
  const cleanup: string[] = [];
  const terminals: vscode.Terminal[] = [];

  /** A folder holding `names`, each a script that runs the stub agent, or `body` when given. */
  function agents(names: string[], body?: string): string {
    const dir = mkdtempSync(join(tmpdir(), "sustain-agents-"));
    cleanup.push(dir);
    const stub = join(extensionPath(), "test/fixtures/streams/stub-agent.mjs");
    for (const name of names) {
      const path = join(dir, name);
      writeFileSync(path, body ?? `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${stub}" "$@"\n`);
      chmodSync(path, 0o755);
    }
    process.env["PATH"] = `${dir}:${savedPath}`;
    return dir;
  }

  function scratch(name: string): string {
    const dir = mkdtempSync(join(tmpdir(), "sustain-scratch-"));
    cleanup.push(dir);
    return join(dir, name);
  }

  async function reveal(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.sustain");
    await until(() => hook.homeState().visible, "the sidebar to show");
  }

  async function settled(): Promise<NonNullable<ReturnType<TestHook["runCard"]>>> {
    await until(() => hook.runCard() !== null && hook.runCard()!.status !== "running", "the run to end");
    return hook.runCard()!;
  }

  function installSkill(): void {
    writeSkill(homedir(), join(extensionPath(), "dist/skills/sustain-architecture"), skillTargets(homedir(), "sustain-architecture"), "sustain-architecture");
  }

  suiteSetup(async () => {
    hook = (await vscode.extensions.getExtension("sustain.sustain")!.activate()) as TestHook;
  });

  setup(async () => {
    root = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
    ui = stubUi();
    savedPath = process.env["PATH"];
    await hook.setDataNoteShown(true);
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration("sustain").update("confirmAboveTokens", undefined, vscode.ConfigurationTarget.Global);
    installSkill();
  });

  teardown(async () => {
    if (hook.runCard()?.status === "running") {
      await hook.postFromHome({ type: "cancelRun" });
      await settled();
    }
    ui.restore();
    process.env["PATH"] = savedPath;
    for (const name of STUB_ENV) delete process.env[name];
    for (const terminal of terminals.splice(0)) terminal.dispose();
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    await vscode.workspace.getConfiguration("sustain").update("runMode", undefined, vscode.ConfigurationTarget.Global);
    for (const dir of cleanup.splice(0)) rmSync(dir, { recursive: true, force: true });
    rmSync(join(root, ".archify"), { recursive: true, force: true });
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
  });

  test("UI-01 revealing the container shows the view for this folder", async () => {
    await reveal();
    const { state } = hook.homeState();
    assert.equal(state?.root, root);
    assert.deepEqual(state?.maps, []);
    assert.equal(state?.composer.runMode, "sidebar");
  });

  test("UI-01 SET-03 Generate from the sidebar takes one click, installs the skill it stated and launches with the typed focus", async () => {
    for (const dir of [".agents", ".claude"]) rmSync(join(homedir(), dir), { recursive: true, force: true });
    await hook.setDataNoteShown(false);
    agents(["claude"]);
    const args = scratch("args.json");
    Object.assign(process.env, { SUSTAIN_STUB_STREAM: stream("claude-generate.jsonl"), SUSTAIN_STUB_ARGS: args });
    await reveal();
    const [estimate, ...notes] = hook.homeState().state?.composer.notes ?? [];
    assert.match(estimate ?? "", ESTIMATE);
    assert.deepEqual(notes, [
      "Installs the sustain-architecture skill in ~/.claude/skills/.",
      "Your agent reads this folder and sends what it reads to its own provider. Sustain sends nothing.",
    ]);

    await hook.postFromHome({ type: "generate", focus: "payment flow" });
    await settled();
    const argv = JSON.parse(readFileSync(args, "utf8")) as string[];
    assert.deepEqual(argv.slice(0, 2), ["-p", "/sustain-architecture payment flow"]);
    assert.deepEqual(argv.slice(argv.indexOf("--permission-mode"), argv.indexOf("--permission-mode") + 2), ["--permission-mode", "dontAsk"]);
    assert.equal(prompts(ui), 0, "no prompt besides the click");
    assert.ok(existsSync(join(homedir(), ".claude/skills/sustain-architecture/SKILL.md")));
    assert.deepEqual(hook.homeState().state?.composer.notes, [estimate]);
    assert.equal(hook.runCard()?.estimate, estimate);
  });

  test("CST-03 above sustain.confirmAboveTokens the sidebar needs a second click and the palette asks in a modal", async () => {
    installSkill();
    await hook.setDataNoteShown(true);
    agents(["claude"]);
    const args = scratch("args.json");
    Object.assign(process.env, { SUSTAIN_STUB_STREAM: stream("claude-generate.jsonl"), SUSTAIN_STUB_ARGS: args });
    await vscode.workspace.getConfiguration("sustain").update("confirmAboveTokens", 1, vscode.ConfigurationTarget.Global);
    await reveal();
    assert.equal(hook.homeState().state?.composer.confirm, true);

    await hook.postFromHome({ type: "generate", focus: "first click" });
    assert.equal(existsSync(args), false, "one click launches nothing");
    await hook.postFromHome({ type: "generate", focus: "second click", confirmed: true });
    await settled();
    assert.deepEqual((JSON.parse(readFileSync(args, "utf8")) as string[]).slice(0, 2), ["-p", "/sustain-architecture second click"]);

    ui.answers.inputBox.push("palette");
    ui.answers.info.push(undefined);
    await vscode.commands.executeCommand("sustain.generateArchitecture");
    const modal = ui.infos.find((call) => (call.rest[0] as { modal?: boolean } | undefined)?.modal === true);
    assert.equal(modal?.message, "Generate with Claude Code?");
    assert.match((modal?.rest[0] as { detail: string }).detail, ESTIMATE);
  });

  test("UI-02 a replayed stream shows feed, tokens and acceptance, records the run and opens the map", async () => {
    agents(["claude"]);
    const candidate = join(extensionPath(), "fixtures/archify/examples/rag-pipeline.architecture.json");
    Object.assign(process.env, { SUSTAIN_STUB_STREAM: stream("claude-generate.jsonl"), SUSTAIN_STUB_CANDIDATE: candidate, SUSTAIN_STUB_DELAY: "200" });
    await reveal();
    await hook.postFromHome({ type: "generate", focus: "rag" });
    await until(() => hook.statusText().startsWith("Sustain: generating"), "the status bar to show the run");

    const card = await settled();
    assert.equal(card.status, "done");
    assert.ok(card.feed.some((item) => item.kind === "validate" && item.text.startsWith("Accepted")), JSON.stringify(card.feed));
    assert.ok(card.usage.output > 0);
    assert.equal(card.costUsd, 0.4123);
    assert.equal(card.phase, "accepted");
    assert.match(card.runFolder ?? "", /^architecture-stub-/);

    const record = JSON.parse(readFileSync(join(root, ".archify", card.runFolder!, "run.json"), "utf8")) as Record<string, unknown>;
    assert.equal(record["agent"], "Claude Code");
    assert.equal(record["mode"], "sidebar");
    assert.equal(record["costUsd"], 0.4123);
    assert.ok((record["tokens"] as { output: number }).output > 0);

    const file = join(root, ".archify", card.runFolder!, "candidate.json");
    await until(() => hook.panelState().file === file, "the map to open");
    assert.equal(hook.statusText(), "$(type-hierarchy-sub) Sustain");
    assert.equal(ui.infos.filter((call) => call.message.startsWith("New architecture diagram")).length, 0, "the run opens its own map");
    assert.equal(hook.homeState().state?.maps[0]?.agent, "Claude Code");
  });

  test("UI-02 Cancel kills the agent and the processes it started", async () => {
    agents(["claude"]);
    const pids = scratch("pids.json");
    Object.assign(process.env, { SUSTAIN_STUB: "hang", SUSTAIN_STUB_PIDS: pids });
    await reveal();
    await hook.postFromHome({ type: "generate", focus: "" });
    await until(() => existsSync(pids), "the stub to start");
    const [agent, child] = JSON.parse(readFileSync(pids, "utf8")) as [number, number];
    await hook.postFromHome({ type: "cancelRun" });
    const card = await settled();
    assert.equal(card.status, "cancelled");
    await until(() => !alive(agent) && !alive(child), "the agent and its child to exit");
  });

  test("UI-02 a denial offers terminal mode, which relaunches the same request in a terminal", async () => {
    const bin = agents(["claude"]);
    process.env["SUSTAIN_STUB_STREAM"] = stream("claude-denied.jsonl");
    await reveal();
    await hook.postFromHome({ type: "generate", focus: "tests" });
    const card = await settled();
    assert.deepEqual(card.denials, ["Bash: npm test"]);

    const opened = nextTerminal();
    await hook.postFromHome({ type: "runInTerminal" });
    const terminal = await opened;
    terminals.push(terminal);
    const options = terminal.creationOptions as vscode.TerminalOptions;
    assert.equal(options.shellPath, join(bin, "claude"));
    assert.deepEqual(options.shellArgs, ["/sustain-architecture tests"]);
    assert.equal(hook.runCard()?.mode, "terminal");
  });

  test("CST-04 a terminal run's run.json transitions show in the card", async () => {
    agents(["claude"], "#!/bin/sh\nsleep 30\n");
    await reveal();
    await hook.postFromHome({ type: "setRunMode", runMode: "terminal" });
    const opened = nextTerminal();
    await hook.postFromHome({ type: "generate", focus: "terminal" });
    terminals.push(await opened);
    assert.equal(hook.runCard()?.mode, "terminal");

    const dir = join(root, ".archify/architecture-terminal-20261018-120000");
    mkdirSync(dir, { recursive: true });
    const base = { schema: 1, kind: "full", focus: "terminal", paths: [], base: null, parent: null, createdAt: new Date().toISOString(), skillVersion: "test" };
    const steps: [string, number][] = [["created", 0], ["validating", 1], ["rejected", 1], ["validating", 2], ["accepted", 2]];
    for (const [phase, attempts] of steps) {
      writeFileSync(join(dir, "run.json"), JSON.stringify({ ...base, phase, attempts, ...(phase === "accepted" ? { finishedAt: new Date().toISOString() } : {}) }));
      await until(() => hook.runCard()?.phase === phase && hook.runCard()?.attempts === attempts, `the card to show ${phase} ${attempts}`);
    }
    assert.equal(hook.runCard()?.status, "done");
    const record = JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as Record<string, unknown>;
    assert.equal(record["mode"], "terminal");
    assert.equal(record["agent"], "Claude Code");
  });

  test("SET-02 the setup check finds the stubbed agent and offers one fix for each failing check", async () => {
    const node = findOnPath("node", { PATH: savedPath });
    assert.ok(node, "node is on the test PATH");
    const bin = agents(["claude"]);
    process.env["PATH"] = `${bin}:${dirname(node)}`;
    await vscode.commands.executeCommand("sustain.checkSetup");
    await until(() => hook.homeState().state?.setup != null, "the setup checks");
    const checks = hook.homeState().state!.setup!;
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    assert.equal(byId["node"]?.ok, true);
    assert.deepEqual([byId["claude"]?.ok, byId["claude"]?.detail], [true, "9.9.9 (stub)"]);
    assert.equal(byId["codex"]?.ok, false);
    assert.equal(byId["skills"]?.ok, true);
    assert.equal(byId["git"]?.ok, false);
    for (const check of checks) assert.equal(check.ok || check.fix !== undefined, true, `${check.id} has a fix`);

    await hook.postFromHome({ type: "fix", check: "codex" });
    assert.equal(await vscode.env.clipboard.readText(), "npm install -g @openai/codex");
  });

  test("UI-04 the status bar item's command opens the sidebar", async () => {
    await reveal();
    await vscode.commands.executeCommand("workbench.action.closeSidebar");
    await until(() => !hook.homeState().visible, "the sidebar to close");
    assert.equal(hook.statusText(), "$(type-hierarchy-sub) Sustain");
    await vscode.commands.executeCommand("sustain.home.focus");
    await until(() => hook.homeState().visible, "the sidebar to show");
  });

  test("UI-01 Delete asks first and removes the run folder", async () => {
    const dir = join(root, ".archify/architecture-gone-20261018-120000");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "candidate.json"), JSON.stringify({ components: [{ id: "a", label: "A", type: "backend" }] }));
    await reveal();
    assert.equal(hook.homeState().state?.maps.length, 1);
    ui.answers.warning.push(undefined);
    await hook.postFromHome({ type: "deleteMap", file: join(dir, "candidate.json") });
    assert.ok(existsSync(dir));
    ui.answers.warning.push("Delete");
    await hook.postFromHome({ type: "deleteMap", file: join(dir, "candidate.json") });
    assert.equal(existsSync(dir), false);
    assert.deepEqual(hook.homeState().state?.maps, []);
  });

  test("UI-06 a recorded answer renders with checked links, its citation opens the line, and a follow-up resumes the session", async () => {
    const run = ".archify/architecture-ask-20261018-120000";
    mkdirSync(join(root, run), { recursive: true });
    writeFileSync(join(root, run, "candidate.json"), JSON.stringify({ components: [{ id: "alpha", label: "Alpha service", type: "backend", sources: [{ path: "src/a.ts", line: 2 }] }] }));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/a.ts"), "// alpha\nexport const alpha = 1;\n");
    writeFileSync(join(root, ".env"), "SECRET=1\n");
    cleanup.push(join(root, "src"), join(root, ".env"));
    agents(["claude"]);
    const args = scratch("args.json");
    Object.assign(process.env, { SUSTAIN_STUB_STREAM: stream("claude-ask.jsonl"), SUSTAIN_STUB_ARGS: args });
    await reveal();
    await hook.postFromHome({ type: "clearAsk" });

    await hook.postFromHome({ type: "ask", question: "Where does alpha start?" });
    const turn = hook.homeState().state!.ask.turns[0]!;
    assert.equal(turn.status, "done");
    assert.equal(turn.costUsd, 0.0311);
    const argv = JSON.parse(readFileSync(args, "utf8")) as string[];
    assert.match(argv[1]!, /First read the architecture map in \.archify\/architecture-ask-20261018-120000\/candidate\.json/);
    assert.deepEqual(argv.slice(argv.indexOf("--allowedTools") + 1), ["Read", "Grep", "Glob"]);
    assert.equal(argv.includes("--resume"), false);

    const spans = turn.blocks.flatMap((block) => (block.kind === "paragraph" ? block.spans : block.kind === "list" ? block.items.flat() : []));
    assert.deepEqual(spans.filter((span) => span.kind === "cite").map((span) => span.text), ["src/a.ts:2"], "the .env citation stays text");
    assert.deepEqual(spans.filter((span) => span.kind === "box").map((span) => span.text), ["Alpha service"]);

    await hook.postFromHome({ type: "openCitation", path: "src/a.ts", line: 2, endLine: null });
    await until(() => vscode.window.activeTextEditor?.document.uri.fsPath === join(root, "src/a.ts"), "src/a.ts to open");
    assert.equal(vscode.window.activeTextEditor!.selection.start.line, 1);
    await hook.postFromHome({ type: "openCitation", path: ".env", line: 1, endLine: null });
    assert.equal(vscode.window.activeTextEditor?.document.uri.fsPath, join(root, "src/a.ts"), "a denied path never opens");

    await hook.postFromHome({ type: "focusBox", id: "alpha" });
    await until(() => hook.panelHighlight()?.ids.join() === "alpha", "the box to be marked");

    await hook.postFromHome({ type: "ask", question: "And where is it used?" });
    const follow = JSON.parse(readFileSync(args, "utf8")) as string[];
    assert.deepEqual(follow.slice(follow.indexOf("--resume"), follow.indexOf("--resume") + 2), ["--resume", "ask-1"]);
    assert.equal(follow[1], "And where is it used?\n\nCite every claim as path:line, relative to the repository root.");
    assert.equal(hook.homeState().state!.ask.turns.length, 2);

    await hook.postFromHome({ type: "clearAsk" });
    assert.deepEqual(hook.homeState().state!.ask.turns, []);
  });
});
