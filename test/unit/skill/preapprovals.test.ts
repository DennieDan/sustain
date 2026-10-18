// SAF-02: no shipped skill pre-approves an edit tool or a Bash command that can reach a program.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseFrontMatter } from "../../../scripts/check-docs.mjs";
import { repoRoot } from "../support/sourceScan";

const SKILLS = ["sustain-architecture", "sustain-bugfix", "sustain-refresh"];

/** Scripts whose every argument is data the script validates. */
const DATA_ONLY_SCRIPTS = /^Bash\(node \S+\/scripts\/(repo-facts|refresh-facts|validate|session)\.mjs( \*)?\)$/;

/** The `allowed-tools` entries that are edit tools or Bash rules reaching anything but a data-only script. */
function unsafeRules(allowedTools: string): string[] {
  const rules = allowedTools.match(/[\w-]+(?:\([^)]*\))?/g) ?? [];
  return rules.filter((rule) => /^(Edit|Write|NotebookEdit|MultiEdit)\b/.test(rule) || (rule.startsWith("Bash") && !DATA_ONLY_SCRIPTS.test(rule)));
}

test.each(SKILLS)("SAF-02 %s pre-approves no edit tool and no open-ended Bash rule", (name) => {
  const fields = parseFrontMatter(readFileSync(join(repoRoot, "skills", name, "SKILL.md"), "utf8"))?.fields;
  expect(fields?.["allowed-tools"]).toBeDefined();
  expect(unsafeRules(fields!["allowed-tools"]!)).toEqual([]);
});

test("SAF-02 the rule check flags edit tools, script wildcards and arbitrary commands", () => {
  expect(unsafeRules("Read Edit Write NotebookEdit Bash(node x/scripts/*) Bash(curl *) Bash(node x/scripts/session.mjs *)")).toEqual([
    "Edit",
    "Write",
    "NotebookEdit",
    "Bash(node x/scripts/*)",
    "Bash(curl *)",
  ]);
});
