// Merge/remove of the Sustain block in `<repo>/.devin/hooks.v1.json` plus Sustain's lines in
// `.git/info/exclude` (ADR 0032; lifecycle per spec v0.3 SAF-06). No `vscode` import, so the merge is unit-tested in
// Node — the cases that matter: a file that already holds user hooks, a hand-edited file,
// an empty file, a corrupt file. Never a blind overwrite: only hook objects whose command
// runs a `.agents/skills/sustain-*` script are touched, so user entries always survive.
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertWritable } from "../model/confine";
import { writeJson } from "../model/session";

export const DEVIN_HOOKS_FILE = join(".devin", "hooks.v1.json");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
function readHooksFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`.devin/hooks.v1.json is corrupt: ${(error as Error).message}`);
  }
  if (!isRecord(value)) throw new Error(`.devin/hooks.v1.json is corrupt: not an object`);
  return value;
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
 * Removes Sustain's hook entries when no learning session holds `.sustain/active` (SAF-06).
 * Called when the lock disappears and at activation. Returns what removing did.
 */
export function removeHooksWhenIdle(root: string): HooksRemoval {
  if (existsSync(join(root, ".sustain", "active"))) return "none";
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
