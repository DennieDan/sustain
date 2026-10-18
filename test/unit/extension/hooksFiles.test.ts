// The `.devin/hooks.v1.json` merge/remove and `.gitignore` append behind Install Agent
// Skills (ADR 0036/0039): partial existing file, hand-edited file, empty file, corrupt
// file — a user's own hooks must always survive.
import { existsSync, readdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ensureGitExclude, EXCLUDE_LINES, mergeAgentHooks, mergeHooks, mergeSessionHooks, removeHooks, removeHooksWhenIdle, SUSTAIN_HOOK_MARKER, sustainHooks } from "../../../src/extension/hooksFiles";
import { put, tempDir } from "../support/temp";

const HOOKS = ".devin/hooks.v1.json";

function readHooks(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, HOOKS), "utf8"));
}

function sustainHookCommands(root: string): string[] {
  const file = readHooks(root);
  const commands: string[] = [];
  for (const groups of Object.values(file)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      for (const hook of (group as { hooks?: { command?: string }[] }).hooks ?? []) {
        if (hook.command?.includes(SUSTAIN_HOOK_MARKER)) commands.push(hook.command);
      }
    }
  }
  return commands;
}

describe("mergeHooks", () => {
  test("creates the file with only the Sustain block when none exists", () => {
    const root = tempDir();
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    expect(Object.keys(file).sort()).toEqual(["PostCompaction", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
    expect(sustainHookCommands(root)).toHaveLength(4);
    // The blocklist matcher covers the mutation + subagent tools.
    const pre = file["PreToolUse"] as { matcher?: string }[];
    expect(pre[0]!["matcher"]).toContain("edit");
    expect(pre[0]!["matcher"]).toContain("run_subagent");
  });

  test("SAF-05 refuses .devin linked outside the root and writes nothing there", () => {
    const root = tempDir();
    const outside = tempDir();
    symlinkSync(outside, join(root, ".devin"), process.platform === "win32" ? "junction" : "dir");
    expect(() => mergeHooks(root)).toThrow(/outside/);
    expect(readdirSync(outside)).toEqual([]);
  });

  test("preserves a user's own entries and is idempotent", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({
      PreToolUse: [{ matcher: "exec", hooks: [{ type: "command", command: "./scripts/check.sh", timeout: 10 }] }],
      Stop: [{ matcher: "", hooks: [{ type: "prompt", prompt: "Did you run tests?" }] }],
      "x-custom": { note: "user metadata" },
    })}\n`);
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    // User's exec check, Stop hook and metadata key all survive alongside ours.
    const pre = file["PreToolUse"] as { matcher?: string }[];
    expect(pre.some((group) => group["matcher"] === "exec")).toBe(true);
    expect(pre.some((group) => group["matcher"]?.includes("edit"))).toBe(true);
    expect(file["Stop"]).toHaveLength(1);
    expect(file["x-custom"]).toEqual({ note: "user metadata" });
    // Second merge changes nothing — idempotent.
    const before = readFileSync(join(root, HOOKS), "utf8");
    expect(mergeHooks(root)).toBe(false);
    expect(readFileSync(join(root, HOOKS), "utf8")).toBe(before);
  });

  test("rewrites only Sustain's entries when hand-edited", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({
      PreToolUse: [
        // A stale Sustain entry (old command path) plus the user's own hook in one group.
        {
          matcher: "^(edit)$",
          hooks: [
            { type: "command", command: "node .agents/skills/sustain-bugfix/scripts/old-hook.mjs" },
            { type: "command", command: "./scripts/user-check.sh" },
          ],
        },
      ],
      UserPromptSubmit: [{ matcher: "", hooks: [{ type: "command", command: "node .agents/skills/sustain-bugfix/scripts/session-hook.mjs" }] }],
    })}\n`);
    expect(mergeHooks(root)).toBe(true);
    const file = readHooks(root);
    // The stale sustain command is gone from PreToolUse; the user's hook stayed in its group.
    const pre = file["PreToolUse"] as { hooks: { command: string }[] }[];
    const commands = pre.flatMap((group) => group.hooks.map((hook) => hook.command));
    expect(commands).toContain("./scripts/user-check.sh");
    expect(commands.some((command) => command.includes("old-hook.mjs"))).toBe(false);
    // Exactly one Sustain block per event — the stale UserPromptSubmit entry was replaced.
    expect(sustainHookCommands(root)).toHaveLength(4);
  });

  test("an empty file merges like a missing one", () => {
    const root = tempDir();
    put(root, HOOKS, "  \n");
    expect(mergeHooks(root)).toBe(true);
    expect(sustainHookCommands(root)).toHaveLength(4);
  });

  test.each([
    ["unparseable JSON", "{PreToolUse:"],
    ["a non-object", '["not","object"]'],
  ])("a corrupt file (%s) throws and is left untouched", (_name, content) => {
    const root = tempDir();
    put(root, HOOKS, content);
    expect(() => mergeHooks(root)).toThrow(/corrupt/);
    expect(readFileSync(join(root, HOOKS), "utf8")).toBe(content);
  });
});

describe("removeHooks", () => {
  test("deletes the file only when nothing else remains", () => {
    const root = tempDir();
    mergeHooks(root);
    expect(removeHooks(root)).toBe("deleted");
    expect(existsSync(join(root, HOOKS))).toBe(false);
  });

  test("keeps user entries and reports updated", () => {
    const root = tempDir();
    put(root, HOOKS, `${JSON.stringify({ Stop: [{ hooks: [{ type: "command", command: "./mine.sh" }] }] })}\n`);
    mergeHooks(root);
    expect(removeHooks(root)).toBe("updated");
    const file = readHooks(root);
    expect(file["Stop"]).toHaveLength(1);
    expect(Object.keys(file)).toEqual(["Stop"]);
    // Second removal is a no-op on a file without Sustain entries.
    expect(removeHooks(root)).toBe("none");
  });

  test("missing file is a no-op", () => {
    expect(removeHooks(tempDir())).toBe("none");
  });
});

describe("SAF-06 ensureGitExclude", () => {
  test("appends the missing lines to .git/info/exclude once, keeping the user's lines", () => {
    const root = tempDir();
    put(root, ".git/info/exclude", "# git ls-files --others --exclude-from=.git/info/exclude\n*.log");
    expect(ensureGitExclude(root)).toBe(true);
    expect(readFileSync(join(root, ".git/info/exclude"), "utf8")).toBe(`# git ls-files --others --exclude-from=.git/info/exclude\n*.log\n${EXCLUDE_LINES.join("\n")}\n`);
    expect(ensureGitExclude(root)).toBe(false);
  });

  test("leaves a folder without a .git directory alone", () => {
    const root = tempDir();
    put(root, ".git", "gitdir: ../elsewhere/.git/worktrees/x\n");
    expect(ensureGitExclude(root)).toBe(false);
    expect(ensureGitExclude(tempDir())).toBe(false);
  });

  test("never writes .gitignore", () => {
    const root = tempDir();
    put(root, ".git/HEAD", "ref: refs/heads/main\n");
    ensureGitExclude(root);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });
});

describe("SAF-06 removeHooksWhenIdle", () => {
  test("keeps Sustain's hooks while a session holds the lock and removes them once it is gone", () => {
    const root = tempDir();
    put(root, ".sustain/active", "bugfix-demo-20261018-120000\n");
    mergeHooks(root);
    expect(removeHooksWhenIdle(root)).toBe("none");
    expect(existsSync(join(root, HOOKS))).toBe(true);
    rmSync(join(root, ".sustain/active"));
    expect(removeHooksWhenIdle(root)).toBe("deleted");
    expect(existsSync(join(root, HOOKS))).toBe(false);
  });
});

describe("sustainHooks", () => {
  test("covers the enforcement blocklist and the context events", () => {
    const hooks = sustainHooks();
    expect(Object.keys(hooks).sort()).toEqual(["PostCompaction", "PreToolUse", "SessionStart", "UserPromptSubmit"]);
    expect(JSON.stringify(hooks)).toContain("session-hook.mjs");
  });
});

describe("LRN-01 Claude Code and Codex hooks", () => {
  const CLAUDE = ".claude/settings.local.json";
  const CODEX = ".codex/hooks.json";
  const read = (root: string, file: string): Record<string, any> => JSON.parse(readFileSync(join(root, file), "utf8"));
  const command = (root: string): string => `node "${join(root, ".agents/skills/sustain-bugfix/scripts/session-hook.mjs")}"`;

  test("a Claude Code session merges PreToolUse for Edit, Write, NotebookEdit and Agent into its local settings, keeping the user's, once", () => {
    const root = tempDir();
    put(root, CLAUDE, `${JSON.stringify({ permissions: { allow: ["Bash(npm test)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./check.sh" }] }] } })}\n`);
    mergeSessionHooks(root, "claude");
    const settings = read(root, CLAUDE);
    expect(settings["permissions"]).toEqual({ allow: ["Bash(npm test)"] });
    expect(settings["hooks"]["PreToolUse"]).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: "./check.sh" }] },
      { matcher: "Edit|Write|NotebookEdit|Agent", hooks: [{ type: "command", command: command(root), timeout: 5 }] },
    ]);
    const before = readFileSync(join(root, CLAUDE), "utf8");
    mergeSessionHooks(root, "claude");
    expect(readFileSync(join(root, CLAUDE), "utf8")).toBe(before);
    expect(existsSync(join(root, HOOKS))).toBe(false);
  });

  test("a Codex session writes .codex/hooks.json matching apply_patch and leaves one Sustain entry in all three files", () => {
    const root = tempDir();
    mergeSessionHooks(root, "devin");
    mergeSessionHooks(root, "claude", "/home/u");
    mergeSessionHooks(root, "codex", "/home/u");
    expect(read(root, CODEX)).toEqual({ hooks: { PreToolUse: [{ matcher: "apply_patch", hooks: [{ type: "command", command: 'node "/home/u/.agents/skills/sustain-bugfix/scripts/session-hook.mjs"', timeout: 5 }] }] } });
    expect(existsSync(join(root, CLAUDE))).toBe(false);
    expect(existsSync(join(root, HOOKS))).toBe(false);
    mergeSessionHooks(root, "devin");
    expect(existsSync(join(root, CODEX))).toBe(false);
    expect(sustainHookCommands(root)).toHaveLength(4);
  });

  test("when the session ends, Sustain's entries go from every file, and a file left empty is deleted", () => {
    const root = tempDir();
    put(root, CODEX, `${JSON.stringify({ description: "team hooks", hooks: { Stop: [{ hooks: [{ type: "command", command: "./notify.sh" }] }] } })}\n`);
    mergeSessionHooks(root, "codex");
    mergeAgentHooks(root, "claude", command(root));
    expect(removeHooksWhenIdle(root)).toBe("none");
    expect(read(root, CODEX)).toEqual({ description: "team hooks", hooks: { Stop: [{ hooks: [{ type: "command", command: "./notify.sh" }] }] } });
    expect(existsSync(join(root, CLAUDE))).toBe(false);
  });
});
