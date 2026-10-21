// SAF-02: the skill scripts start no program named by their arguments and never use a shell.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot, sourceFiles } from "./support/sourceScan";

/** Programs a spawn may start, per file. Git and the setup check resolve theirs from absolute PATH entries. */
const ALLOWED_PROGRAMS: Record<string, string[]> = { "*": ["process.execPath"], "src/model/git.ts": ["program"], "src/model/preflight.ts": ["binary"] };

function execViolations(file: string, source: string): string[] {
  const violations: string[] = [];
  if (/\bshell\s*:\s*true\b/.test(source)) violations.push(`${file}: shell: true`);
  const allowed = [...ALLOWED_PROGRAMS["*"]!, ...(ALLOWED_PROGRAMS[file] ?? [])];
  for (const match of source.matchAll(/(?<![.\w])(spawnSync|spawn|execFileSync|execFile|execSync|exec)\s*\(\s*([^,)\s]+)/g)) {
    if (!allowed.includes(match[2]!)) violations.push(`${file}: ${match[1]}(${match[2]})`);
  }
  return violations;
}

test("SAF-02 src/agent and src/model spawn only node itself or the resolved git", () => {
  const files = [...sourceFiles("src/agent"), ...sourceFiles("src/model")];
  const violations = files.flatMap((file) => execViolations(file, readFileSync(join(repoRoot, file), "utf8")));
  expect(violations).toEqual([]);
});

test("SAF-02 the scan flags a shell, a caller-named program and an exec string", () => {
  expect(execViolations("src/agent/x.ts", 'spawnSync(command, { shell: true });\nexecSync("rm -rf " + dir);\npattern.exec(text);')).toEqual([
    "src/agent/x.ts: shell: true",
    "src/agent/x.ts: spawnSync(command)",
    'src/agent/x.ts: execSync("rm)',
  ]);
});
