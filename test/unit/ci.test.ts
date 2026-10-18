// ENG-01 and PRC-04: the CI workflow runs the gates the spec names and the Sustain check.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { repoRoot } from "./support/sourceScan";

const workflow = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");

/** The `run:` commands of one job, in order. */
function jobRuns(job: string): string[] {
  const start = workflow.indexOf(`\n  ${job}:\n`);
  expect(start, `job ${job} exists`).toBeGreaterThan(-1);
  const rest = workflow.slice(start + job.length + 5);
  const end = rest.search(/\n {2}[\w-]+:\n/);
  const body = end < 0 ? rest : rest.slice(0, end);
  return [...body.matchAll(/- run: (.+)/g)].map((match) => match[1]!);
}

test("the check job runs npm run check on Linux, macOS and Windows", () => {
  expect(workflow).toContain("os: [ubuntu-latest, macos-latest, windows-latest]");
  expect(jobRuns("check")).toEqual(["npm ci", "npm run check"]);
});

test("the e2e, package and Node 18 script jobs run their commands", () => {
  expect(jobRuns("e2e")).toEqual(["npm ci", "xvfb-run -a npm run test:e2e"]);
  expect(jobRuns("package")).toEqual(["npm ci", "npm run package"]);
  expect(jobRuns("scripts-node18")).toEqual([
    'echo "SUSTAIN_SCRIPT_NODE=$(command -v node)" >> "$GITHUB_ENV"',
    "npm ci",
    "npx vitest run --project unit test/unit/agent",
  ]);
});

test("PRC-04 the Action's committed bundle is rebuilt and compared, and the Action checks pull requests", () => {
  expect(jobRuns("action-dist")).toEqual(["npm ci", "npm run action", "git diff --exit-code action/dist"]);
  const job = workflow.slice(workflow.indexOf("\n  sustain-check:\n"));
  expect(job).toContain("if: github.event_name == 'pull_request'");
  expect(job).toContain("pull-requests: write");
  expect(job).toContain("fetch-depth: 0");
  expect(job).toContain("- uses: ./action");
});

test("D5 the cloud job runs the cloud's unit tests, build and [web] suite", () => {
  expect(jobRuns("cloud")).toEqual(["npm ci", "npm run -w cloud test", "npm run -w cloud build", "npx -w cloud playwright install --with-deps chromium", "npm run -w cloud test:web"]);
});

test("RCH-02 CI rebuilds the skills and fails when the committed scripts are stale", () => {
  expect(jobRuns("skills-fresh")).toEqual(["npm ci", "npm run build", "git diff --exit-code skills"]);
});

test("RCH-02 CI assembles the plugin and validates it with Claude Code", () => {
  expect(jobRuns("plugin")).toEqual(["npm ci", "npm run build:release", "npx --yes @anthropic-ai/claude-code@2.1.302 plugin validate release/plugin"]);
});
