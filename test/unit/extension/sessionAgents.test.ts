// LRN-01: Start Learning offers Claude Code and Codex as well as Devin, and launches each with the
// skill prompt alone.
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { sessionAgents, sessionArgs } from "../../../src/extension/sessionAgents";
import { put, tempDir } from "../support/temp";

test("LRN-01 Claude Code, Codex and Devin on PATH are offered in that order", () => {
  const bin = tempDir();
  for (const name of ["devin", "codex", "claude"]) {
    put(bin, name, "#!/bin/sh\n");
    chmodSync(join(bin, name), 0o755);
  }
  expect(sessionAgents({ PATH: bin, HOME: tempDir() }, () => false, "linux").map((entry) => [entry.label, entry.binary])).toEqual([
    ["Claude Code", join(bin, "claude")],
    ["Codex", join(bin, "codex")],
    ["Devin", join(bin, "devin")],
  ]);
});

test("LRN-01 each agent's terminal gets the skill prompt alone, after -- for Devin", () => {
  expect(sessionArgs("claude", " add a helper ")).toEqual(["/sustain-bugfix add a helper"]);
  expect(sessionArgs("codex", "add a helper")).toEqual(["$sustain-bugfix add a helper"]);
  expect(sessionArgs("devin", "add a helper")).toEqual(["--", "/sustain-bugfix add a helper"]);
});
