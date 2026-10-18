// PRC-05: when the Action updates the map, the argv and isolated environment it runs the agent with,
// and that a fork's pull request is never updated.
import { join } from "node:path";
import { expect, test } from "vitest";
import { refreshCommand, refreshDecision } from "../../action/src/refresh";

const HEAD = "a".repeat(40);
const event = (fields: { fork?: boolean; full?: string; sha?: string } = {}) => ({
  pull_request: { head: { sha: fields.sha ?? HEAD, repo: { full_name: fields.full ?? "acme/shop", fork: fields.fork ?? false } } },
  repository: { full_name: "acme/shop" },
});
const components = [{ id: "api", sources: [{ path: "src/api/handler.ts" }] }];
const report = { candidates: [{ dir: "src/billing", files: [], lines: 0, label: "billing" }], stale: [{ id: "api", label: "API", state: "edited" as const }], gone: [] };
const decide = (fields: Partial<Parameters<typeof refreshDecision>[0]>) =>
  refreshDecision({ refresh: "claude", env: { ANTHROPIC_API_KEY: "sk-ant" }, event: event(), report, components, head: HEAD, ...fields });

test("PRC-05 the map is updated only when asked, with the agent's key, at the pull request's head, and with something to cover", () => {
  expect(decide({})).toEqual({ run: true, agent: "claude", paths: ["src/api/handler.ts", "src/billing"] });
  expect(decide({ refresh: "codex", env: { OPENAI_API_KEY: "sk" } })).toMatchObject({ run: true, agent: "codex" });
  expect(decide({ refresh: "" })).toEqual({ run: false, reason: null });
  expect(decide({ refresh: "gemini" })).toEqual({ run: false, reason: "refresh takes claude or codex." });
  expect(decide({ env: {} })).toEqual({ run: false, reason: "refresh: claude needs ANTHROPIC_API_KEY in the step's env." });
  expect(decide({ refresh: "codex" })).toEqual({ run: false, reason: "refresh: codex needs OPENAI_API_KEY in the step's env." });
  expect(decide({ head: "b".repeat(40) })).toEqual({ run: false, reason: "Updating the map needs the pull request's head checked out. Set ref to github.head_ref in actions/checkout." });
  expect(decide({ report: { candidates: [], stale: [], gone: [] } })).toEqual({ run: false, reason: null });
});

test("PRC-05 a pull request from a fork is never updated, whatever else holds", () => {
  const refused = { run: false, reason: "The map is never updated on a pull request from a fork." };
  expect(decide({ event: event({ fork: true }) })).toEqual(refused);
  expect(decide({ event: event({ full: "someone/shop" }) })).toEqual(refused);
  expect(decide({ event: { pull_request: { head: { sha: HEAD, repo: null } }, repository: { full_name: "acme/shop" } } })).toEqual(refused);
});

test("PRC-05 the agent runs the sidebar's headless argv for the refresh, in a fresh home, with only PATH, its home and its key", () => {
  const home = "/tmp/sustain-refresh-x";
  const env = { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-openai", GITHUB_TOKEN: "ghs_secret" };
  const skill = join(home, ".claude/skills/sustain-refresh/scripts");
  expect(refreshCommand("claude", "architecture-shop-20261019-120000", ["src/api/handler.ts", "src/billing"], home, env)).toEqual({
    args: [
      "-p",
      "/sustain-refresh --from architecture-shop-20261019-120000 --paths src/api/handler.ts src/billing",
      "--output-format",
      "stream-json",
      "--verbose",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      "Read",
      "Grep",
      "Glob",
      `Bash(node ${skill}/refresh-facts.mjs *)`,
      `Bash(node ${skill}/validate.mjs *)`,
      `Bash(node ${skill}/render-html.mjs *)`,
      "Edit(./.archify/**)",
    ],
    env: { PATH: "/usr/bin", HOME: home, LANG: "C.UTF-8", CLAUDE_CONFIG_DIR: join(home, ".claude"), ANTHROPIC_API_KEY: "sk-ant" },
  });
  expect(refreshCommand("codex", "architecture-shop-20261019-120000", ["src/billing"], home, env)).toEqual({
    args: ["exec", "--json", "--sandbox", "workspace-write", "$sustain-refresh --from architecture-shop-20261019-120000 --paths src/billing"],
    env: { PATH: "/usr/bin", HOME: home, LANG: "C.UTF-8", CODEX_HOME: join(home, ".codex"), OPENAI_API_KEY: "sk-openai", CODEX_API_KEY: "sk-openai" },
  });
});
