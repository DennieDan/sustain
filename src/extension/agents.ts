// Agent launch details for `Sustain: Generate Architecture` (FR-GEN-01). No `vscode` import,
// so the prompt format is unit-tested in Node. The PATH lookup lives in `src/model/which.ts`.
export { findOnPath } from "../model/which";

export interface Agent {
  /** QuickPick label and terminal name suffix. */
  label: "Claude Code" | "Codex";
  /** Executable looked up on PATH. */
  cli: "claude" | "codex";
  /** Skill invocation prefix. */
  invoke: "/sustain-architecture" | "$sustain-architecture";
}

export const AGENTS: readonly Agent[] = [
  { label: "Claude Code", cli: "claude", invoke: "/sustain-architecture" },
  { label: "Codex", cli: "codex", invoke: "$sustain-architecture" },
];

/** The terminal's argument vector: the prompt alone, never a permission flag (SAF-04). */
export function agentLaunchArgs(prompt: string): string[] {
  return [prompt];
}

/** `/sustain-architecture <focus>` or `$sustain-architecture <focus>`; no trailing space for an empty focus. */
export function agentPrompt(agent: Agent, focus: string): string {
  const trimmed = focus.trim();
  return trimmed === "" ? agent.invoke : `${agent.invoke} ${trimmed}`;
}
