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
  test("SKILL.md declares the manual-only skill with its pre-approved tools", () => {
    const parsed = parseFrontMatter(read("SKILL.md"));
    expect(parsed?.fields).toEqual({
      name: "sustain-architecture",
      description:
        "Generate an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.",
      "disable-model-invocation": "true",
      "allowed-tools": "Read Grep Glob Bash(node .agents/skills/sustain-architecture/scripts/*)",
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
