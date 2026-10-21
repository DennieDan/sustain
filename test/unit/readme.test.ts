// DOC-01: the README answers how to start, where things are, what to commit, what it costs, what it
// touches and how to remove it, and no longer says what has stopped being true.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "./support/sourceScan";

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const headings = readme.split("\n").filter((line) => /^#{2,3} /.test(line));

test("DOC-01 the README has a quick start per setup and the sections people look for", () => {
  expect(headings).toEqual(
    expect.arrayContaining([
      "## Quick start",
      "### VS Code, Cursor or Devin Desktop",
      "### IntelliJ and other JetBrains IDEs",
      "### Skill only",
      "### Claude Code plugin",
      "### GitHub Action",
      "## Where to find it",
      "## Commit your map",
      "## What it costs",
      "## What it touches on your machine",
      "## How to remove it",
    ]),
  );
});

test("DOC-01 the README drops the .gitignore line and the advice to commit skill folders", () => {
  expect(readme).not.toContain("does not edit `.gitignore`");
  expect(readme).not.toMatch(/commit the skill folders/i);
});
