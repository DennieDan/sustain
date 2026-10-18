// File operations behind `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006; the
// learning-session install extends the same targets per ADR 0036). No `vscode` import,
// so the symlink fallback is unit-tested in Node.
import { cpSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { assertWritable } from "../model/confine";

/** The skills `Sustain: Install Agent Skills` ships: architecture + the learning session. */
export const SKILL_NAMES: readonly string[] = ["sustain-architecture", "sustain-bugfix", "sustain-refresh"];

/** Repo-relative `.agents/skills/<name>`, `/`-separated (also used in messages). */
export function agentsSkillDir(name: string): string {
  return `.agents/skills/${name}`;
}

/** Repo-relative `.claude/skills/<name>` — the Claude-side entry (symlink or copy). */
export function claudeSkillLink(name: string): string {
  return `.claude/skills/${name}`;
}

export type SkillScope = "user" | "project";

/**
 * The folder that holds `.agents/skills` and `.claude/skills` for `scope` (SET-01): the
 * user's home, so nothing is added to the repository, or the repository itself.
 */
export function skillBase(scope: SkillScope, root: string, home: string = homedir()): string {
  return scope === "user" ? home : root;
}

export interface SkillTargets {
  agentsDir: string;
  claudeLink: string;
}

export function skillTargets(root: string, name: string): SkillTargets {
  return {
    agentsDir: join(root, ...agentsSkillDir(name).split("/")),
    claudeLink: join(root, ...claudeSkillLink(name).split("/")),
  };
}

/** Whether anything (including a dangling symlink) exists at either target. */
export function skillInstalled(targets: SkillTargets): boolean {
  return [targets.agentsDir, targets.claudeLink].some((path) => {
    try {
      lstatSync(path);
      return true;
    } catch {
      return false;
    }
  });
}

export type LinkFn = (target: string, path: string, type: "dir" | "junction") => void;

/**
 * Removes both targets (a symlink is removed, not followed), copies `source` to the
 * `.agents` folder and links the `.claude` entry to it; copies there too when `link` throws.
 * Both targets must stay inside `root` (SAF-05). Returns how the `.claude` entry was created.
 */
export function writeSkill(root: string, source: string, targets: SkillTargets, name: string, link: LinkFn = symlinkSync): "symlink" | "copy" {
  rmSync(targets.agentsDir, { recursive: true, force: true });
  rmSync(targets.claudeLink, { recursive: true, force: true });
  assertWritable(root, targets.agentsDir);
  assertWritable(root, targets.claudeLink);
  cpSync(source, targets.agentsDir, { recursive: true });
  mkdirSync(dirname(targets.claudeLink), { recursive: true });
  try {
    link(`../../.agents/skills/${name}`, targets.claudeLink, process.platform === "win32" ? "junction" : "dir");
    return "symlink";
  } catch {
    rmSync(targets.claudeLink, { recursive: true, force: true });
    cpSync(source, targets.claudeLink, { recursive: true });
    return "copy";
  }
}
