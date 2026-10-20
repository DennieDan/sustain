// SET-02: the setup check reads versions and names one fix per failing check.
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { parseVersion, runPreflight } from "../../../src/model/preflight";
import { put, tempDir } from "../support/temp";

/** A folder of stub CLIs that print `version` for `--version`. */
function stubs(versions: Record<string, string>): string {
  const dir = tempDir();
  for (const [name, version] of Object.entries(versions)) chmodSync(put(dir, name, `#!/bin/sh\necho "${version}"\n`), 0o755);
  return dir;
}

describe("SET-02 setup check", () => {
  test.each([
    ["v20.11.1", { major: 20, minor: 11, patch: 1 }],
    ["2.1.284 (Claude Code)", { major: 2, minor: 1, patch: 284 }],
    ["codex-cli 0.48.0", { major: 0, minor: 48, patch: 0 }],
    ["no version here", null],
  ])("parseVersion(%j)", (text, expected) => {
    expect(parseVersion(text)).toEqual(expected);
  });

  test.skipIf(process.platform === "win32")("passing checks report versions (stub CLIs are POSIX shell scripts)", async () => {
    const root = tempDir();
    put(root, ".git/HEAD", "ref: refs/heads/main\n");
    const bin = stubs({ node: "v20.11.1", claude: "2.1.284 (Claude Code)", codex: "codex-cli 0.48.0", devin: "devin 1.4.0" });
    const checks = await runPreflight({ env: { PATH: bin }, root, skillsIntact: true });
    expect(checks.map((check) => [check.id, check.ok, check.detail])).toEqual([
      ["node", true, "Node 20.11.1"],
      ["claude", true, "2.1.284 (Claude Code)"],
      ["codex", true, "codex-cli 0.48.0"],
      ["devin", true, "devin 1.4.0"],
      ["skills", true, "Sustain's skills are installed and unchanged"],
      ["git", true, "Git repository"],
    ]);
  });

  test.skipIf(process.platform === "win32")("failing checks each name one fix (stub CLIs are POSIX shell scripts)", async () => {
    const bin = stubs({ node: "v16.20.2" });
    const devinPath = join(stubs({ devin: "devin 1.4.0" }), "devin");
    const checks = await runPreflight({ env: { PATH: bin }, root: tempDir(), skillsIntact: false, devinPath });
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId["node"]).toMatchObject({ ok: false, detail: "Node 16 is older than 18", fix: { kind: "open" } });
    expect(byId["claude"]).toMatchObject({ ok: false, fix: { kind: "copy", text: "npm install -g @anthropic-ai/claude-code" } });
    expect(byId["codex"]).toMatchObject({ ok: false, fix: { kind: "copy", text: "npm install -g @openai/codex" } });
    expect(byId["devin"]).toMatchObject({ ok: true, detail: "devin 1.4.0" });
    expect(byId["skills"]).toMatchObject({ ok: false, fix: { kind: "install-skills" } });
    expect(byId["git"]).toMatchObject({ ok: false, fix: { kind: "copy", text: "git init" } });
  });
});
