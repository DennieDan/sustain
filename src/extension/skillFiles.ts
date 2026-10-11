// File operations behind `Sustain: Install Agent Skills` (FR-INS-01, ADR 0006). No `vscode`
// import, so the symlink fallback is unit-tested in Node.
import { cpSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";

export const SKILL_NAME = "sustain-architecture";
/** Repo-relative locations, `/`-separated (also used in messages). */
export const AGENTS_SKILL_DIR = `.agents/skills/${SKILL_NAME}`;
export const CLAUDE_SKILL_LINK = `.claude/skills/${SKILL_NAME}`;
/** Target of the `.claude` link, relative to the link's folder. */
export const CLAUDE_LINK_TARGET = `../../.agents/skills/${SKILL_NAME}`;

export interface SkillTargets {
  agentsDir: string;
  claudeLink: string;
}

export function skillTargets(root: string): SkillTargets {
  return {
    agentsDir: join(root, ...AGENTS_SKILL_DIR.split("/")),
    claudeLink: join(root, ...CLAUDE_SKILL_LINK.split("/")),
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
 * Returns how the `.claude` entry was created.
 */
export function writeSkill(source: string, targets: SkillTargets, link: LinkFn = symlinkSync): "symlink" | "copy" {
  rmSync(targets.agentsDir, { recursive: true, force: true });
  rmSync(targets.claudeLink, { recursive: true, force: true });
  cpSync(source, targets.agentsDir, { recursive: true });
  mkdirSync(dirname(targets.claudeLink), { recursive: true });
  try {
    link(CLAUDE_LINK_TARGET, targets.claudeLink, process.platform === "win32" ? "junction" : "dir");
    return "symlink";
  } catch {
    rmSync(targets.claudeLink, { recursive: true, force: true });
    cpSync(source, targets.claudeLink, { recursive: true });
    return "copy";
  }
}
