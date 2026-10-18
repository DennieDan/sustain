// FR-SKL-01 (frontmatter, openai.yaml) and FR-SKL-03 (format reference) on the shipped files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseFrontMatter } from "../../../scripts/check-docs.mjs";
import { repoRoot } from "../support/sourceScan";

const skillDir = join(repoRoot, "skills/sustain-architecture");
const read = (rel: string): string => readFileSync(join(skillDir, rel), "utf8");

/** Two-level YAML mapping with quoted or bare scalars, as used by `agents/openai.yaml`. */
function parseNestedYaml(text: string): Record<string, Record<string, string | boolean>> {
  const out: Record<string, Record<string, string | boolean>> = {};
  let section: Record<string, string | boolean> | undefined;
  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const top = /^([\w-]+):\s*$/.exec(line);
    if (top) {
      section = {};
      out[top[1]!] = section;
      continue;
    }
    const entry = /^ {2}([\w-]+):\s*(.+)$/.exec(line);
    if (!entry || !section) throw new Error(`unexpected YAML line: ${line}`);
    const raw = entry[2]!.trim();
    section[entry[1]!] = raw === "true" ? true : raw === "false" ? false : raw.replace(/^"(.*)"$/, "$1");
  }
  return out;
}

describe("FR-SKL-01 skill frontmatter", () => {
  test("SAF-02 SET-01 SKILL.md declares the manual-only skill with its pre-approved tools", () => {
    const parsed = parseFrontMatter(read("SKILL.md"));
    expect(parsed?.fields).toEqual({
      name: "sustain-architecture",
      description:
        "Generate an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.",
      "disable-model-invocation": "true",
      "allowed-tools":
        "Read Grep Glob Bash(node ${CLAUDE_SKILL_DIR}/scripts/repo-facts.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/render-html.mjs *)",
    });
  });

  test("agents/openai.yaml names the skill and forbids implicit invocation", () => {
    expect(parseNestedYaml(read("agents/openai.yaml"))).toEqual({
      interface: { display_name: "Sustain Architecture", short_description: "Generate an architecture diagram for Sustain" },
      policy: { allow_implicit_invocation: false },
    });
  });
});

describe("FR-SKL-03 format reference", () => {
  const reference = read("references/archify-format.md");

  test.each(["list_dir", "read_file", "grep", "repo_meta", "submit_diagram"])("does not mention the prototype tool %s", (tool) => {
    expect(reference.toLowerCase()).not.toContain(tool);
  });

  test('does not mention "the app"', () => {
    expect(reference).not.toMatch(/\bthe app\b/i);
  });

  test("keeps the Archify attribution", () => {
    expect(reference).toContain("github.com/tt-a1i/archify, MIT");
  });
});

describe("SET-01 install anywhere", () => {
  test.each(["sustain-architecture", "sustain-bugfix", "sustain-refresh", "sustain-tour"])("SKL-02 %s finds its scripts through its own folder, never a repository path", (name) => {
    const text = readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8");
    expect(text).not.toContain(".agents/skills/");
    expect(text).not.toContain(".claude/skills/");
    expect(text).toContain("${CLAUDE_SKILL_DIR}/scripts/");
  });
});

describe("FRS-05 refresh skill", () => {
  const refreshDir = join(repoRoot, "skills/sustain-refresh");

  test("SKILL.md declares the manual-only skill with its two scripts", () => {
    expect(parseFrontMatter(readFileSync(join(refreshDir, "SKILL.md"), "utf8"))?.fields).toEqual({
      name: "sustain-refresh",
      description: "Bring an existing Sustain architecture diagram up to date with the code. Invoke manually with --from <run folder> and optional --paths <glob>.",
      "disable-model-invocation": "true",
      "allowed-tools":
        "Read Grep Glob Bash(node ${CLAUDE_SKILL_DIR}/scripts/refresh-facts.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/render-html.mjs *)",
    });
    expect(parseNestedYaml(readFileSync(join(refreshDir, "agents/openai.yaml"), "utf8"))).toEqual({
      interface: { display_name: "Sustain Refresh", short_description: "Bring a Sustain architecture diagram up to date" },
      policy: { allow_implicit_invocation: false },
    });
  });

  test("it re-examines only what changed and keeps unchanged ids", () => {
    const text = readFileSync(join(refreshDir, "SKILL.md"), "utf8");
    for (const phrase of ["`boxes`", "`moved`", "`uncovered`", "`newFolders`", "With `paths`, change nothing outside that scope.", "including its `id`"]) expect(text).toContain(phrase);
  });
});

describe("CST-03 cost before every run", () => {
  test.each(["sustain-architecture", "sustain-refresh"])("%s tells the user its estimate in step 2", (name) => {
    const text = readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8");
    const step2 = text.slice(text.indexOf("## 2."), text.indexOf("## 3."));
    expect(step2).toContain("Before you go on, tell the user the estimate in one line. Use `estimate.claude.text` if you are Claude Code, and `estimate.codex.text` otherwise.");
  });
});

describe("CST-05 exploration budget", () => {
  test("the architecture skill keeps to repo-facts' budget and names each tier's", () => {
    const text = read("SKILL.md");
    expect(text).toContain("Keep its `runFolder`, `draft`, `git` and `budget` values");
    expect(text).toContain("Keep to `budget` reads and searches in total. It is 25 for a repository of tier S, 45 for tier M and 70 for tier L");
    expect(text).toContain("When the budget is spent, stop exploring and write the draft");
  });
});

describe("ACC-01 behaviour over names", () => {
  test("the format reference asks for behaviour ranges, observed labels and real groupings", () => {
    const reference = readFileSync(join(skillDir, "references/archify-format.md"), "utf8");
    expect(reference).toContain("cites at least one range that shows its behaviour: a call site, a handler body, a registration, a query or a write");
    expect(reference).toContain("Each label states behaviour you observed");
    expect(reference).toContain("A group needs a shared runtime role, owner or boundary; shared naming alone is not one.");
    expect(reference).toContain("`DeclarationOnly`");
  });

  test.each(["sustain-architecture", "sustain-refresh"])("%s reviews the evidence once, outside the repair count", (name) => {
    const text = readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8");
    expect(text).toContain("## 7. Review the evidence once");
    expect(text).toContain("in the same run folder and validate it again");
    expect(text).toContain("This revision does not count against the 3 repairs");
    expect(text).toMatch(/it happens once/);
  });
});
