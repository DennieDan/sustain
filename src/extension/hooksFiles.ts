// Merge/remove of the Sustain block in `<repo>/.devin/hooks.v1.json`, and in the `hooks` of
// `.claude/settings.local.json` and `.codex/hooks.json` (spec v0.3 LRN-01), plus Sustain's lines in
// `.git/info/exclude` (ADR 0032; lifecycle per spec v0.3 SAF-06). No `vscode` import, so the merge is unit-tested in
// Node — the cases that matter: a file that already holds user hooks, a hand-edited file,
// an empty file, a corrupt file. Never a blind overwrite: only hook objects whose command
// runs a `.agents/skills/sustain-*` script are touched, so user entries always survive.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertWritable } from "../model/confine";
import { writeJson } from "../model/jsonFile";
import { isRecord } from "../core/types";

export const DEVIN_HOOKS_FILE = join(".devin", "hooks.v1.json");
/** LRN-01: the files whose `hooks` object holds Claude Code's and Codex's hunt hook, relative to the repository. */
export const AGENT_HOOKS_FILES = { claude: ".claude/settings.local.json", codex: ".codex/hooks.json" } as const;
/** LRN-01: the tools each agent's hook matches. Codex reports every file edit as `apply_patch`. */
export const AGENT_HUNT_MATCHERS = { claude: "Edit|Write|NotebookEdit|Agent", codex: "apply_patch" } as const;

/** The agents a learning session can run in. */
export type SessionAgent = "claude" | "codex" | "devin";
/** A hook object is Sustain's iff its `command` contains this marker (ADR 0040). */
export const SUSTAIN_HOOK_MARKER = ".agents/skills/sustain-";

/**
 * The command that runs `session-hook.mjs`: from the repository for a project install, or by
 * absolute path from the per-user install at `base` (SET-01). Both contain {@link SUSTAIN_HOOK_MARKER}.
 */
export function sessionHookCommand(base?: string): string {
  if (base === undefined) return 'node "$DEVIN_PROJECT_DIR/.agents/skills/sustain-bugfix/scripts/session-hook.mjs"';
  return `node "${join(base, ".agents", "skills", "sustain-bugfix", "scripts", "session-hook.mjs").split("\\").join("/")}"`;
}
const HUNT_BLOCKLIST = "^(edit|write|apply_patch|notebook_edit|run_subagent)$";
const HOOK_TIMEOUT = 5;

function promptHookGroup(command: string): Record<string, unknown> {
  return { matcher: "", hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT }] };
}

/** The Sustain-managed block, running `command` (see {@link sessionHookCommand}). */
export function sustainHooks(command: string = sessionHookCommand()): Record<string, unknown[]> {
  return {
    PreToolUse: [{ matcher: HUNT_BLOCKLIST, hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT }] }],
    UserPromptSubmit: [promptHookGroup(command)],
    PostCompaction: [promptHookGroup(command)],
    SessionStart: [promptHookGroup(command)],
  };
}

function isSustainHook(value: unknown): boolean {
  return isRecord(value) && typeof value["command"] === "string" && value["command"].includes(SUSTAIN_HOOK_MARKER);
}

/** `groups` minus every Sustain hook object; groups left hook-less are dropped. */
function stripSustain(groups: unknown): unknown[] {
  if (!Array.isArray(groups)) return [];
  const kept: unknown[] = [];
  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group["hooks"])) {
      kept.push(group); // not a hook group shape we know — leave the user's entry alone
      continue;
    }
    const hooks = group["hooks"].filter((hook) => !isSustainHook(hook));
    if (hooks.length > 0) kept.push({ ...group, hooks });
  }
  return kept;
}

/** Parsed hooks file, or `null` when absent/empty. Throws `corrupt` on unmergeable content. */
function readHooksFile(path: string, name = ".devin/hooks.v1.json"): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${name} is corrupt: ${(error as Error).message}`);
  }
  if (!isRecord(value)) throw new Error(`${name} is corrupt: not an object`);
  return value;
}

/** `hooks` minus every Sustain hook object; events left without groups are dropped, and other values kept. */
function strippedEvents(hooks: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) {
      kept[event] = groups;
      continue;
    }
    const left = stripSustain(groups);
    if (left.length > 0) kept[event] = left;
  }
  return kept;
}

/** LRN-01: the PreToolUse block Claude Code or Codex gets under its file's `hooks`. */
export function agentHooks(agent: "claude" | "codex", command: string): Record<string, unknown[]> {
  return { PreToolUse: [{ matcher: AGENT_HUNT_MATCHERS[agent], hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT }] }] };
}

/** Writes `agent`'s Sustain block into the `hooks` of its file, keeping every other key and hook. Returns whether the file changed. */
export function mergeAgentHooks(root: string, agent: "claude" | "codex", command: string): boolean {
  const path = join(root, ...AGENT_HOOKS_FILES[agent].split("/"));
  const existing = readHooksFile(path, AGENT_HOOKS_FILES[agent]) ?? {};
  const hooks = strippedEvents(isRecord(existing["hooks"]) ? existing["hooks"] : {});
  for (const [event, groups] of Object.entries(agentHooks(agent, command))) hooks[event] = [...((hooks[event] as unknown[] | undefined) ?? []), ...groups];
  const merged = { ...existing, hooks };
  if (JSON.stringify(existing) === JSON.stringify(merged)) return false;
  assertWritable(root, path);
  mkdirSync(dirname(path), { recursive: true });
  writeJson(path, merged);
  return true;
}

/** Removes Sustain's hook objects from `agent`'s file; deletes the file only when nothing else remains. */
export function removeAgentHooks(root: string, agent: "claude" | "codex"): HooksRemoval {
  const path = join(root, ...AGENT_HOOKS_FILES[agent].split("/"));
  const existing = readHooksFile(path, AGENT_HOOKS_FILES[agent]);
  if (existing === null || !isRecord(existing["hooks"])) return "none";
  const hooks = strippedEvents(existing["hooks"]);
  const remaining: Record<string, unknown> = { ...existing, hooks };
  if (Object.keys(hooks).length === 0) delete remaining["hooks"];
  if (JSON.stringify(existing) === JSON.stringify(remaining)) return "none";
  assertWritable(root, path);
  if (Object.keys(remaining).length === 0) {
    rmSync(path, { force: true });
    return "deleted";
  }
  writeJson(path, remaining);
  return "updated";
}

/**
 * LRN-01: merges the hunt hooks of the agent a session launches in, and removes Sustain's entries
 * from the other agents' files, so each agent meets one Sustain entry. The Devin CLI also reads
 * `.claude/` hooks, and a Devin session leaves Sustain's Claude Code entry out. `base` is the
 * per-user install folder, or `undefined` for a project install.
 */
export function mergeSessionHooks(root: string, agent: SessionAgent, base?: string): void {
  if (agent === "devin") mergeHooks(root, sessionHookCommand(base));
  else removeHooks(root);
  for (const other of ["claude", "codex"] as const) {
    if (other === agent) mergeAgentHooks(root, other, sessionHookCommand(base ?? root));
    else removeAgentHooks(root, other);
  }
}

/**
 * Writes the Sustain block into `root`'s hooks file, preserving everything else.
 * Idempotent: merging twice is a no-op. Throws on a corrupt or non-array event entry —
 * the caller warns and nothing is overwritten.
 */
export function mergeHooks(root: string, command: string = sessionHookCommand()): boolean {
  const path = join(root, DEVIN_HOOKS_FILE);
  const existing = readHooksFile(path) ?? {};
  const merged: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(existing)) {
    if (!Array.isArray(groups)) {
      merged[event] = groups; // not a hook-event key — foreign metadata, preserved as-is
      continue;
    }
    const kept = stripSustain(groups);
    if (kept.length > 0) merged[event] = kept;
  }
  for (const [event, groups] of Object.entries(sustainHooks(command))) {
    merged[event] = [...((merged[event] as unknown[] | undefined) ?? []), ...groups];
  }
  if (JSON.stringify(existing ?? {}) === JSON.stringify(merged)) return false;
  assertWritable(root, path);
  mkdirSync(dirname(path), { recursive: true });
  writeJson(path, merged);
  return true;
}

/** What removing the Sustain block did: `none` (no file), `updated`, or `deleted` (emptied). */
export type HooksRemoval = "none" | "updated" | "deleted";

/** Removes every Sustain hook object; deletes the file only when nothing else remains. */
export function removeHooks(root: string): HooksRemoval {
  const path = join(root, DEVIN_HOOKS_FILE);
  const existing = readHooksFile(path);
  if (existing === null) return "none";
  const remaining: Record<string, unknown> = {};
  for (const [event, groups] of Object.entries(existing)) {
    if (!Array.isArray(groups)) {
      remaining[event] = groups; // foreign shape — not ours, keep
      continue;
    }
    const kept = stripSustain(groups);
    if (kept.length > 0) remaining[event] = kept;
  }
  assertWritable(root, path);
  if (Object.keys(remaining).length === 0) {
    rmSync(path, { force: true });
    return "deleted";
  }
  if (JSON.stringify(existing) === JSON.stringify(remaining)) return "none";
  writeJson(path, remaining);
  return "updated";
}

/**
 * Removes Sustain's hook entries from every agent's file when no learning session holds
 * `.sustain/active` (SAF-06, LRN-01). Called when the lock disappears and at activation.
 * Returns what removing did to the Devin file.
 */
export function removeHooksWhenIdle(root: string): HooksRemoval {
  if (existsSync(join(root, ".sustain", "active"))) return "none";
  for (const agent of ["claude", "codex"] as const) removeAgentHooks(root, agent);
  return removeHooks(root);
}

/** Lines Sustain keeps out of git through the repository's local exclude file (SAF-06). */
export const EXCLUDE_LINES: readonly string[] = [".sustain/", ".archify/**/draft.json", ".archify/**/*.html"];

/**
 * Appends any missing {@link EXCLUDE_LINES} to `.git/info/exclude`, which git reads and never
 * commits. Does nothing when `.git` is not a folder, as in a worktree or outside git. Returns
 * whether the file changed.
 */
export function ensureGitExclude(root: string): boolean {
  const gitDir = join(root, ".git");
  if (!existsSync(gitDir) || !lstatSync(gitDir).isDirectory()) return false;
  const path = join(gitDir, "info", "exclude");
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const present = new Set(text.split("\n").map((line) => line.trim()));
  const missing = EXCLUDE_LINES.filter((line) => !present.has(line));
  if (missing.length === 0) return false;
  assertWritable(root, path);
  mkdirSync(dirname(path), { recursive: true });
  const prefix = text === "" ? "" : text.endsWith("\n") ? text : `${text}\n`;
  writeFileSync(path, `${prefix}${missing.join("\n")}\n`);
  return true;
}

/** SAF-08: removes {@link EXCLUDE_LINES} from `.git/info/exclude`, keeping every other line; returns whether the file changed. */
export function removeGitExclude(root: string): boolean {
  const path = join(root, ".git", "info", "exclude");
  if (!existsSync(path)) return false;
  const text = readFileSync(path, "utf8");
  const kept = text.split("\n").filter((line) => !EXCLUDE_LINES.includes(line.trim()));
  const next = kept.join("\n");
  if (next === text) return false;
  assertWritable(root, path);
  writeFileSync(path, next);
  return true;
}
