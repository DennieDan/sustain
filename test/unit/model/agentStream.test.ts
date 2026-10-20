// UI-02: agent output becomes feed items, token totals and an end result.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { claudeParser } from "../../../src/model/agentStream/claude";
import { codexParser } from "../../../src/model/agentStream/codex";
import type { StreamParser, StreamUpdate } from "../../../src/model/agentStream/feed";
import { FEED_LIMIT, RunTracker } from "../../../src/model/agentStream/tracker";
import { repoRoot } from "../support/sourceScan";

function replay(parser: StreamParser, fixture: string): StreamUpdate[] {
  return readFileSync(join(repoRoot, "test/fixtures/streams", fixture), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => parser.line(line));
}

describe("UI-02 Claude Code stream", () => {
  const updates = replay(claudeParser(), "claude-generate.jsonl");

  test("tool calls and validator reports become feed items in order", () => {
    expect(updates.flatMap((update) => update.items.map((item) => `${item.kind}: ${item.text}`))).toEqual([
      "command: Creating the run folder",
      "message: Reading the entry points first.",
      "read: Reading /r/src/extension/extension.ts",
      "search: Searching for createTerminal",
      "write: Writing the draft",
      "validate: Validating the draft",
      "validate: Rejected with 1 error, repairing",
      "validate: Accepted",
    ]);
  });

  test("the running total grows with each step and the result sets the final usage, cost and session", () => {
    expect(updates[1]!.usage).toEqual({ input: 1200, output: 80, cacheRead: 3000, cacheWrite: 500 });
    expect(updates[3]!.usage).toEqual({ input: 3200, output: 230, cacheRead: 7000, cacheWrite: 500 });
    const last = updates.at(-1)!;
    expect(last.usage).toEqual({ input: 8300, output: 1190, cacheRead: 15000, cacheWrite: 500 });
    expect(last.end).toEqual({ ok: true, costUsd: 0.4123, denials: [], sessionId: "sess-123", finalAnswer: "Accepted: 14 components in .archify/architecture-r-20261018-120000/candidate.json" });
  });

  test("a denied tool and an error result are reported", () => {
    const parser = claudeParser();
    const update = parser.line(
      JSON.stringify({
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        result: "Permission to use Bash was denied",
        permission_denials: [{ tool_name: "Bash", tool_input: { command: "cat ~/.ssh/id_rsa" } }],
      }),
    );
    expect(update.items).toEqual([{ kind: "error", text: "Permission to use Bash was denied" }]);
    expect(update.end).toMatchObject({ ok: false, denials: ["Bash: cat ~/.ssh/id_rsa"] });
  });

  test("lines that are not JSON add nothing", () => {
    expect(claudeParser().line("not json")).toEqual({ items: [] });
  });
});

describe("UI-02 Codex stream", () => {
  const updates = replay(codexParser(), "codex-generate.jsonl");

  test("commands, messages, file changes and validator output become feed items", () => {
    expect(updates.flatMap((update) => update.items.map((item) => `${item.kind}: ${item.text}`))).toEqual([
      "command: Creating the run folder",
      "message: Mapping the extension host and the webview.",
      "write: Writing the draft",
      "validate: Validating the draft",
      "validate: Accepted",
    ]);
  });

  test("turn usage counts cached input once, and reasoning inside the output", () => {
    expect(updates.at(-1)!.usage).toEqual({ input: 12000, output: 1500, cacheRead: 9000, cacheWrite: 0 });
  });
});

describe("UI-02 run tracker", () => {
  test("lines split across chunks are joined, and the exit decides the status", () => {
    const tracker = new RunTracker(codexParser());
    const lines = readFileSync(join(repoRoot, "test/fixtures/streams/codex-generate.jsonl"), "utf8");
    tracker.push(lines.slice(0, 100));
    tracker.push(lines.slice(100));
    expect(tracker.state.feed.map((item) => item.kind)).toEqual(["command", "message", "write", "validate", "validate"]);
    expect(tracker.finish(0, false).status).toBe("done");
  });

  test("a cancel wins over the exit code, and a reported failure over a zero exit", () => {
    expect(new RunTracker(codexParser()).finish(0, true).status).toBe("cancelled");
    const failed = new RunTracker(claudeParser());
    failed.push(`${JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true })}\n`);
    expect(failed.finish(0, false).status).toBe("failed");
    expect(new RunTracker(codexParser()).finish(1, false).status).toBe("failed");
  });

  test("the feed keeps the latest items only", () => {
    const tracker = new RunTracker(codexParser());
    const line = JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "ls" } });
    tracker.push(`${`${line}\n`.repeat(FEED_LIMIT + 5)}`);
    expect(tracker.state.feed).toHaveLength(FEED_LIMIT);
  });
});

describe("UI-06 answers", () => {
  test("messages are paragraphs, and Claude Code's final reply replaces the narration before it", () => {
    const tracker = new RunTracker(claudeParser());
    const say = (text: string): string => JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text }] } });
    tracker.push(`${say("Reading the map first.")}\n${say("Generate lives in src/extension/generate.ts:60.")}\n`);
    expect(tracker.state.answer).toBe("Reading the map first.\n\nGenerate lives in src/extension/generate.ts:60.");
    tracker.push(`${JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Generate lives in src/extension/generate.ts:60.", session_id: "s1" })}\n`);
    expect(tracker.finish(0, false).answer).toBe("Generate lives in src/extension/generate.ts:60.");
  });

  test("a failed result keeps the streamed text", () => {
    const tracker = new RunTracker(claudeParser());
    tracker.push(`${JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Partial" }] } })}\n`);
    tracker.push(`${JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "" })}\n`);
    expect(tracker.finish(1, false).answer).toBe("Partial");
  });
});
