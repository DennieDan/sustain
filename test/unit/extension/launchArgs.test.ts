// SAF-04: agents launch with the prompt alone and only from absolute PATH entries.
import { chmodSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { agentLaunchArgs, agentPrompt, AGENTS, findOnPath, headlessArgs, SKILL_SCRIPTS, skillPrompt } from "../../../src/extension/agents";
import { devinPromptArgs } from "../../../src/extension/devin";
import { put, tempDir } from "../support/temp";

/** Flags that turn off an agent's permission checks. Two-word flags are matched as adjacent elements. */
const FORBIDDEN = [
  "--dangerously-skip-permissions",
  "bypassPermissions",
  "--dangerously-bypass-approvals-and-sandbox",
  "--yolo",
  "--dangerously-bypass-hook-trust",
  "--permission-mode dangerous",
  "--permission-mode autonomous",
  "yolo",
  "--respect-workspace-trust false",
];

function forbiddenIn(argv: string[]): string[] {
  const words = [...argv, ...argv.slice(1).map((arg, i) => `${argv[i]} ${arg}`)];
  return FORBIDDEN.filter((flag) => words.includes(flag));
}

const FOCUSES = ["", "payment flow", "--yolo", "--dangerously-skip-permissions"];

describe("SAF-04 launch arguments", () => {
  test.each(FOCUSES)("Claude Code and Codex get the prompt alone for focus %j", (focus) => {
    for (const agent of AGENTS) {
      const argv = agentLaunchArgs(agentPrompt(agent, focus));
      expect(argv).toEqual([agentPrompt(agent, focus)]);
      expect(forbiddenIn(argv)).toEqual([]);
    }
  });

  test.each(FOCUSES)("Devin gets -- and the prompt for task %j", (task) => {
    const argv = devinPromptArgs(`/sustain-bugfix ${task}`.trim());
    expect(argv[0]).toBe("--");
    expect(argv).toHaveLength(2);
    expect(forbiddenIn(argv)).toEqual([]);
  });

  test("UI-02 Claude Code runs headless with exactly the generate tools and dontAsk", () => {
    const argv = headlessArgs("claude", "/sustain-architecture auth", { skillDir: "/h/.claude/skills/sustain-architecture" });
    expect(argv).toEqual([
      "-p",
      "/sustain-architecture auth",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read",
      "Grep",
      "Glob",
      "Bash(node /h/.claude/skills/sustain-architecture/scripts/repo-facts.mjs *)",
      "Bash(node /h/.claude/skills/sustain-architecture/scripts/validate.mjs *)",
      "Edit(./.archify/**)",
    ]);
    expect(forbiddenIn(argv)).toEqual([]);
  });

  test("FRS-06 a refresh names the refresh skill and may run only its own scripts", () => {
    expect(skillPrompt("claude", "sustain-refresh", " --from architecture-a-20261018-120000 ")).toBe("/sustain-refresh --from architecture-a-20261018-120000");
    expect(skillPrompt("codex", "sustain-refresh", "")).toBe("$sustain-refresh");
    const argv = headlessArgs("claude", "/sustain-refresh --from x", { skillDir: "/h/.claude/skills/sustain-refresh", scripts: SKILL_SCRIPTS["sustain-refresh"] });
    expect(argv.slice(argv.indexOf("--allowedTools") + 1)).toEqual([
      "Read",
      "Grep",
      "Glob",
      "Bash(node /h/.claude/skills/sustain-refresh/scripts/refresh-facts.mjs *)",
      "Bash(node /h/.claude/skills/sustain-refresh/scripts/validate.mjs *)",
      "Edit(./.archify/**)",
    ]);
    expect(forbiddenIn(argv)).toEqual([]);
  });

  test("UI-06 a question is read-only and a follow-up resumes the session", () => {
    const argv = headlessArgs("claude", "What calls the validator?", { skillDir: "/s", readOnly: true, resume: "sess-1" });
    expect(argv.slice(argv.indexOf("--allowedTools"))).toEqual(["--allowedTools", "Read", "Grep", "Glob"]);
    expect(argv).toContain("--resume");
    expect(forbiddenIn(argv)).toEqual([]);
  });

  test("UI-02 Codex runs in the workspace-write sandbox, and read-only for a question", () => {
    expect(headlessArgs("codex", "$sustain-architecture", { skillDir: "/s" })).toEqual(["exec", "--json", "--sandbox", "workspace-write", "$sustain-architecture"]);
    expect(headlessArgs("codex", "What calls x?", { skillDir: "/s", readOnly: true })).toEqual(["exec", "--json", "--sandbox", "read-only", "What calls x?"]);
  });

  test("the check spots a permission flag as one element or two", () => {
    expect(forbiddenIn(["--yolo", "x"])).toEqual(["--yolo"]);
    expect(forbiddenIn(["--permission-mode", "dangerous"])).toEqual(["--permission-mode dangerous"]);
  });

  test("a relative PATH entry is skipped even when it holds the binary", () => {
    const root = tempDir();
    const local = put(root, "bin/claude", "#!/bin/sh\n");
    chmodSync(local, 0o755);
    const elsewhere = tempDir();
    const real = put(elsewhere, "claude", "#!/bin/sh\n");
    chmodSync(real, 0o755);
    const cwd = process.cwd();
    process.chdir(root);
    try {
      expect(findOnPath("claude", { PATH: `bin:.:${elsewhere}` }, "linux")).toBe(real);
    } finally {
      process.chdir(cwd);
    }
  });
});
