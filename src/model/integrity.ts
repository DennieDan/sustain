// SAF-01: the skill an agent will load must match the copy Sustain ships.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { isWithin } from "./confine";

/** `dist/skill-hashes.json`: the shipped skills' file hashes, written by the build. */
export interface SkillHashes {
  version: string;
  skills: Record<string, Record<string, string>>;
}

/** The value recorded for a link inside a skill folder. Links are never followed. */
export const LINK_MARK = "link";

/** SHA-256 of every file below `dir`, keyed by `/`-separated relative path. */
export function hashTree(dir: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const key = prefix === "" ? name : `${prefix}/${name}`;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) out[key] = LINK_MARK;
    else if (stat.isDirectory()) Object.assign(out, hashTree(path, key));
    else out[key] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return out;
}

export interface SkillDiff {
  changed: string[];
  missing: string[];
  extra: string[];
}

export function diffSkill(expected: Record<string, string>, actual: Record<string, string>): SkillDiff {
  const keys = Object.keys(expected);
  return {
    changed: keys.filter((key) => key in actual && actual[key] !== expected[key]),
    missing: keys.filter((key) => !(key in actual)),
    extra: Object.keys(actual).filter((key) => !(key in expected)),
  };
}

export function diffSize(diff: SkillDiff): number {
  return diff.changed.length + diff.missing.length + diff.extra.length;
}

/** Repository folders where some agent looks for a skill by name. */
export const SKILL_FOLDERS: readonly string[] = [".agents/skills", ".claude/skills", ".codex/skills", ".devin/skills", ".windsurf/skills"];

export type AgentId = "claude" | "codex" | "devin";

/** The repository folder `agent` loads skill `name` from. SET-01 adds the per-user scope. */
export function effectiveSkillDir(agent: AgentId, name: string): string {
  return agent === "claude" ? `.claude/skills/${name}` : `.agents/skills/${name}`;
}

/** The real folder behind `rel` in `root`, or `null` when it is absent or resolves outside the root. */
function realSkillDir(root: string, rel: string): string | null {
  try {
    const real = realpathSync(join(root, ...rel.split("/")));
    return isWithin(realpathSync(root), real) && lstatSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

export interface SkillCheck {
  /** The folder the agent loads, relative to the root. */
  effective: string;
  /** How it differs from the shipped copy, or `null` when it is absent or leaves the root. */
  diff: SkillDiff | null;
  /** Other copies in the repository whose files differ from the shipped copy, relative to the root. */
  differingCopies: string[];
}

/** Compares the effective skill and every other same-named copy with the shipped hashes. */
export function checkSkill(root: string, agent: AgentId, name: string, expected: Record<string, string>): SkillCheck {
  const effective = effectiveSkillDir(agent, name);
  const effectiveReal = realSkillDir(root, effective);
  const diff = effectiveReal === null ? null : diffSkill(expected, hashTree(effectiveReal));
  const differingCopies: string[] = [];
  for (const folder of SKILL_FOLDERS) {
    const rel = `${folder}/${name}`;
    if (rel === effective) continue;
    const real = realSkillDir(root, rel);
    if (real === null || real === effectiveReal) continue;
    if (diffSize(diffSkill(expected, hashTree(real))) > 0) differingCopies.push(rel);
  }
  return { effective, diff, differingCopies };
}
