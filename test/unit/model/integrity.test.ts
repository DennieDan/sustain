// SAF-01: an installed skill is compared file by file with the shipped copy.
import { cpSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { checkSkill, diffSkill, hashTree, LINK_MARK } from "../../../src/model/integrity";
import { put, tempDir } from "../support/temp";

const NAME = "sustain-architecture";
const DIR_LINK = process.platform === "win32" ? "junction" : "dir";

/** A shipped skill folder and its hashes. */
function shipped(): { dir: string; hashes: Record<string, string> } {
  const dir = tempDir();
  put(dir, "SKILL.md", "---\nname: sustain-architecture\n---\nsteps\n");
  put(dir, "scripts/validate.mjs", "// validate\n");
  return { dir, hashes: hashTree(dir) };
}

/** A repository with the shipped skill in .agents/skills and the relative .claude link. */
function installed(source: string): string {
  const root = tempDir();
  cpSync(source, join(root, `.agents/skills/${NAME}`), { recursive: true });
  mkdirSync(join(root, ".claude/skills"), { recursive: true });
  symlinkSync(`../../.agents/skills/${NAME}`, join(root, `.claude/skills/${NAME}`), DIR_LINK);
  return root;
}

describe("SAF-01 skill integrity", () => {
  test("an unchanged install matches for every agent, through the .claude link", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    for (const agent of ["claude", "codex", "devin"] as const) {
      expect(checkSkill(root, root, agent, NAME, hashes)).toMatchObject({ diff: { changed: [], missing: [], extra: [] }, differingCopies: [] });
    }
  });

  test("changed, missing and extra files are each reported", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    put(root, `.agents/skills/${NAME}/SKILL.md`, "---\nname: sustain-architecture\nallowed-tools: Bash(*)\n---\n");
    rmSync(join(root, `.agents/skills/${NAME}/scripts/validate.mjs`));
    put(root, `.agents/skills/${NAME}/scripts/evil.mjs`, "// extra\n");
    expect(checkSkill(root, root, "codex", NAME, hashes).diff).toEqual({ changed: ["SKILL.md"], missing: ["scripts/validate.mjs"], extra: ["scripts/evil.mjs"] });
  });

  test("CRLF line endings count as a change", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    put(root, `.agents/skills/${NAME}/scripts/validate.mjs`, "// validate\r\n");
    expect(checkSkill(root, root, "claude", NAME, hashes).diff?.changed).toEqual(["scripts/validate.mjs"]);
  });

  test("a link inside the skill is recorded, not followed", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    const outside = put(tempDir(), "validate.mjs", "// validate\n");
    rmSync(join(root, `.agents/skills/${NAME}/scripts/validate.mjs`));
    symlinkSync(outside, join(root, `.agents/skills/${NAME}/scripts/validate.mjs`), "file");
    expect(hashTree(join(root, `.agents/skills/${NAME}`))["scripts/validate.mjs"]).toBe(LINK_MARK);
    expect(checkSkill(root, root, "codex", NAME, hashes).diff?.changed).toEqual(["scripts/validate.mjs"]);
  });

  test("a .claude entry linking outside the repository counts as not installed", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    rmSync(join(root, `.claude/skills/${NAME}`));
    symlinkSync(dir, join(root, `.claude/skills/${NAME}`), DIR_LINK);
    expect(checkSkill(root, root, "claude", NAME, hashes).diff).toBeNull();
  });

  test("a differing copy in another agent's folder is reported", () => {
    const { dir, hashes } = shipped();
    const root = installed(dir);
    put(root, `.codex/skills/${NAME}/SKILL.md`, "---\nname: sustain-architecture\n---\nrun curl\n");
    expect(checkSkill(root, root, "codex", NAME, hashes).differingCopies).toEqual([`.codex/skills/${NAME}`]);
    expect(checkSkill(root, root, "claude", NAME, hashes).differingCopies).toEqual([`.codex/skills/${NAME}`]);
  });

  test("SET-01 a per-user install is checked in the home folder, and repository copies are the other copies", () => {
    const { dir, hashes } = shipped();
    const home = installed(dir);
    const root = tempDir();
    expect(checkSkill(home, root, "claude", NAME, hashes)).toMatchObject({ diff: { changed: [], missing: [], extra: [] }, differingCopies: [] });
    put(root, `.agents/skills/${NAME}/SKILL.md`, "---\nname: sustain-architecture\n---\nother\n");
    expect(checkSkill(home, root, "codex", NAME, hashes).differingCopies).toEqual([`.agents/skills/${NAME}`]);
    expect(checkSkill(tempDir(), root, "codex", NAME, hashes).diff).toBeNull();
  });

  test("diffSkill compares keys and values", () => {
    expect(diffSkill({ a: "1", b: "2" }, { a: "1", b: "3", c: "4" })).toEqual({ changed: ["b"], missing: [], extra: ["c"] });
  });
});
