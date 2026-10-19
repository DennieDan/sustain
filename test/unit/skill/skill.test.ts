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
  test("SKILL.md declares the manual-only skill with its pre-approved tools", () => {
    const parsed = parseFrontMatter(read("SKILL.md"));
    expect(parsed?.fields).toEqual({
      name: "sustain-architecture",
      description:
        "Generate or update an Archify architecture diagram of this repository for the Sustain VS Code viewer. Invoke manually with an optional focus.",
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

  test("FR-UPD-06: connection ids are required", () => {
    expect(reference).toContain("`id` (required; unique across all connections, same pattern as component IDs)");
  });
});

describe("FR-UPD-05 skill body", () => {
  const body = read("SKILL.md");

  test("the eight steps come in order", () => {
    expect([...body.matchAll(/^## (\d)\. (.+)$/gm)].map((match) => `${match[1]}. ${match[2]}`)).toEqual([
      "1. Read the focus",
      "2. Create the run folder",
      "3. Choose update or regenerate",
      "4. Read the format reference",
      "5. Update mode (`mode` is `update`)",
      "6. Regenerate mode (`mode` is `regenerate`)",
      "7. Validate and repair",
      "8. Report",
    ]);
  });

  test("scripts run by repo-root path in the order repo-facts → change-map → match-ids → validate", () => {
    const commands = [...body.matchAll(/^\s*node (\S+)/gm)].map((match) => match[1]);
    expect(commands).toEqual([
      ".agents/skills/sustain-architecture/scripts/repo-facts.mjs",
      ".agents/skills/sustain-architecture/scripts/change-map.mjs",
      ".agents/skills/sustain-architecture/scripts/match-ids.mjs",
      ".agents/skills/sustain-architecture/scripts/validate.mjs",
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
