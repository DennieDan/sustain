// FR-SKL-01 (frontmatter, openai.yaml), FR-SKL-03 / FR-UPD-06 (format reference) and FR-UPD-05
// (skill body) on the shipped files.
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
  test("SAF-02 SET-01 RCH-04 SKILL.md declares the manual-only skill with its pre-approved tools", () => {
    const parsed = parseFrontMatter(read("SKILL.md"));
    expect(parsed?.fields).toEqual({
      name: "sustain-architecture",
      description:
        "Generate or update an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.",
      triggers: "[user]",
      "disable-model-invocation": "true",
      "allowed-tools":
        "Read Grep Glob Bash(node ${CLAUDE_SKILL_DIR}/scripts/repo-facts.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/validate.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/change-map.mjs *) Bash(node ${CLAUDE_SKILL_DIR}/scripts/match-ids.mjs *)",
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

  test("FR-UPD-06: connection ids are required", () => {
    expect(reference).toContain("`id` (required; unique across all connections, same pattern as component IDs)");
  });
});

describe("FR-UPD-05 skill body", () => {
  const body = read("SKILL.md");

  test("the nine steps come in order", () => {
    expect([...body.matchAll(/^## (\d)\. (.+)$/gm)].map((match) => `${match[1]}. ${match[2]}`)).toEqual([
      "1. Read the focus",
      "2. Create the run folder",
      "3. Choose update or regenerate",
      "4. Read the format reference",
      "5. Update mode (`mode` is `update`)",
      "6. Regenerate mode (`mode` is `regenerate`)",
      "7. Validate and repair",
      "8. Review the evidence once",
      "9. Report",
    ]);
  });

  test("scripts run by repo-root path in the order repo-facts → change-map → match-ids → validate", () => {
    const commands = [...body.matchAll(/^\s*node (\S+)/gm)].map((match) => match[1]);
    expect(commands).toEqual([
      "${CLAUDE_SKILL_DIR}/scripts/repo-facts.mjs",
      "${CLAUDE_SKILL_DIR}/scripts/change-map.mjs",
      "${CLAUDE_SKILL_DIR}/scripts/match-ids.mjs",
      "${CLAUDE_SKILL_DIR}/scripts/validate.mjs",
    ]);
  });

  test("the --regenerate token is passed on to change-map.mjs", () => {
    expect(body).toContain(
      "If the focus starts with the token `--regenerate`, remove that token from the focus and remember to pass `--regenerate` in step 3.",
    );
  });

  test(".archify/ stays denied except for the three update inputs, which are never cited", () => {
    expect(body).toContain("- `.git/` and `.archify/`");
    expect(body).toContain(
      "The one exception is step 5: in update mode you read the previous candidate, `mapping.md` and `change.md` named by `change-map.mjs`, and no other file under `.archify/`; you never cite them.",
    );
  });
});

describe("SET-01 install anywhere", () => {
  test.each(["sustain-architecture", "sustain-bugfix"])("SKL-02 %s finds its scripts through its own folder, never a repository path", (name) => {
    const text = readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8");
    expect(text).not.toContain(".agents/skills/");
    expect(text).not.toContain(".claude/skills/");
    expect(text).toContain("${CLAUDE_SKILL_DIR}/scripts/");
  });
});

describe("CST-03 cost before every run", () => {
  test.each(["sustain-architecture"])("%s tells the user its estimate in step 2", (name) => {
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

  test.each(["sustain-architecture"])("%s reviews the evidence once, outside the repair count", (name) => {
    const text = readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8");
    expect(text).toContain("## 8. Review the evidence once");
    expect(text).toContain("in the same run folder and validate it again");
    expect(text).toContain("This revision does not count against the 3 repairs");
    expect(text).toMatch(/it happens once/);
  });
});

test.each(["sustain-architecture", "sustain-bugfix"])("RCH-04 %s is started by the user, with triggers: [user]", (name) => {
  expect(parseFrontMatter(readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8"))?.fields["triggers"]).toBe("[user]");
});
