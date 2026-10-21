// FR-GEN-01 prompt formats and CLI lookup on PATH.
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { agentPrompt, AGENTS, findOnPath } from "../../../src/extension/agents";
import { put, tempDir } from "../support/temp";

const [claude, codex] = AGENTS as [(typeof AGENTS)[number], (typeof AGENTS)[number]];

describe("FR-GEN-01 prompt", () => {
  test.each([
    [claude, "Payment flow", "/sustain-architecture Payment flow"],
    [claude, "", "/sustain-architecture"],
    [claude, "   ", "/sustain-architecture"],
    [codex, " auth service ", "$sustain-architecture auth service"],
    [codex, "", "$sustain-architecture"],
  ])("%o with focus %j → %j", (agent, focus, expected) => {
    expect(agentPrompt(agent, focus)).toBe(expected);
  });

  test.each([
    [claude, "Payment flow", "/sustain-architecture --regenerate Payment flow"],
    [codex, "Payment flow", "$sustain-architecture --regenerate Payment flow"],
    [claude, "", "/sustain-architecture --regenerate"],
    [codex, "", "$sustain-architecture --regenerate"],
    [claude, "   ", "/sustain-architecture --regenerate"],
    [codex, "  auth ", "$sustain-architecture --regenerate auth"],
  ])("FR-UPD-08 regenerate: %o with focus %j → %j", (agent, focus, expected) => {
    expect(agentPrompt(agent, focus, true)).toBe(expected);
  });

  test("RCH-04 the agents are Claude Code, Codex and Devin, in that order", () => {
    expect(AGENTS.map((agent) => [agent.label, agent.cli])).toEqual([
      ["Claude Code", "claude"],
      ["Codex", "codex"],
      ["Devin", "devin"],
    ]);
  });
});

describe("FR-GEN-01 PATH lookup", () => {
  function executable(dir: string, name: string): string {
    const path = put(dir, name, "#!/bin/sh\n");
    chmodSync(path, 0o755);
    return path;
  }

  test("finds the first executable match in PATH order", () => {
    const [a, b] = [tempDir(), tempDir()];
    executable(b, "claude");
    const first = executable(a, "claude");
    expect(findOnPath("claude", { PATH: `${a}:${b}` }, "darwin")).toBe(first);
  });

  test("skips non-executable files, folders and empty entries", () => {
    const [plain, folder, good] = [tempDir(), tempDir(), tempDir()];
    put(plain, "codex", "not executable");
    mkdirSync(join(folder, "codex"));
    const expected = executable(good, "codex");
    expect(findOnPath("codex", { PATH: `:${plain}:${folder}:${good}` }, "linux")).toBe(expected);
  });

  test("returns undefined when absent or PATH is unset", () => {
    expect(findOnPath("claude", { PATH: tempDir() }, "darwin")).toBeUndefined();
    expect(findOnPath("claude", {}, "darwin")).toBeUndefined();
  });

  test("on Windows tries each PATHEXT extension", () => {
    const dir = tempDir();
    const cmd = put(dir, "claude.CMD", "@echo off\n");
    expect(findOnPath("claude", { Path: dir, PATHEXT: ".EXE;.CMD" }, "win32")).toBe(cmd);
  });
});
