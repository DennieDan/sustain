// UI-02: headless runs against a stub agent that replays a recorded stream.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { claudeParser } from "../../../src/vscode/agentStream/claude";
import { canRunHeadless, startHeadless } from "../../../src/vscode/runner";
import { tempDir } from "../support/temp";

const repoRoot = join(__dirname, "../../..");
const stub = join(repoRoot, "test/fixtures/streams/stub-agent.mjs");

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("UI-02 a replayed Claude Code stream fills the feed, tokens and cost, and ends done", async () => {
  const env = { ...process.env, SUSTAIN_STUB_STREAM: join(repoRoot, "test/fixtures/streams/claude-generate.jsonl") };
  let changes = 0;
  const run = startHeadless(process.execPath, [stub], tempDir(), claudeParser(), () => changes++, env);
  const state = await run.done;
  expect(state.status).toBe("done");
  expect(state.feed.some((item) => item.kind === "validate" && item.text.startsWith("Accepted"))).toBe(true);
  expect(state.usage.output).toBeGreaterThan(0);
  expect(state.costUsd).toBe(0.4123);
  expect(state.sessionId).toBe("sess-123");
  expect(changes).toBeGreaterThan(1);
});

test.skipIf(process.platform === "win32")("UI-02 cancel kills the agent and the processes it started", async () => {
  const pids = join(tempDir(), "pids.json");
  const run = startHeadless(process.execPath, [stub], tempDir(), claudeParser(), () => undefined, { ...process.env, SUSTAIN_STUB: "hang", SUSTAIN_STUB_PIDS: pids });
  await vi.waitFor(() => expect(existsSync(pids)).toBe(true));
  const [agent, child] = JSON.parse(readFileSync(pids, "utf8")) as [number, number];
  run.cancel();
  const state = await run.done;
  expect(state.status).toBe("cancelled");
  await vi.waitFor(() => expect([alive(agent), alive(child)]).toEqual([false, false]));
});

test("UI-02 a binary that cannot start ends failed with the reason in the feed", async () => {
  const state = await startHeadless(join(tempDir(), "missing-agent"), [], tempDir(), claudeParser(), () => undefined).done;
  expect(state.status).toBe("failed");
  expect(state.feed.at(-1)?.kind).toBe("error");
  expect(state.feed.at(-1)?.text).toMatch(/ENOENT/);
});

test("UI-02 Windows command shims run in a terminal instead", () => {
  expect(canRunHeadless("C:\\npm\\claude.cmd", "win32")).toBe(false);
  expect(canRunHeadless("C:\\npm\\CODEX.BAT", "win32")).toBe(false);
  expect(canRunHeadless("C:\\tools\\claude.exe", "win32")).toBe(true);
  expect(canRunHeadless("/usr/local/bin/claude", "linux")).toBe(true);
});
