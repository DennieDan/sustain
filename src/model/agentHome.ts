// CST-06, PRC-05: a fresh home for a headless agent run that holds only one skill, with Claude Code's
// hooks off. The bench and the Action's map update both run agents this way.
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EstimateAgent } from "./estimate";

/** A fresh home holding only `skill` for `agent`, with hooks off. Returns the variables that point the agent at it. */
export function agentHome(home: string, agent: EstimateAgent, skill: { name: string; source: string } | null): Record<string, string> {
  for (const base of [".agents", ".claude"]) {
    mkdirSync(join(home, base, "skills"), { recursive: true });
    if (skill !== null) cpSync(skill.source, join(home, base, "skills", skill.name), { recursive: true });
  }
  if (agent === "claude") {
    writeFileSync(join(home, ".claude", "settings.json"), `${JSON.stringify({ disableAllHooks: true }, null, 2)}\n`);
    return { CLAUDE_CONFIG_DIR: join(home, ".claude") };
  }
  mkdirSync(join(home, ".codex"), { recursive: true });
  return { CODEX_HOME: join(home, ".codex") };
}

/** The variables {@link agentHome} would return, without making anything (for --dry-run). */
export function agentHomePreview(home: string, agent: EstimateAgent): Record<string, string> {
  return agent === "claude" ? { CLAUDE_CONFIG_DIR: join(home, ".claude") } : { CODEX_HOME: join(home, ".codex") };
}
