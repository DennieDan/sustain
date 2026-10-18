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

export interface HeadlessOptions {
  /** The skill folder the agent loads, for the exact script rules. */
  skillDir: string;
  /** A question run: read and search tools only (UI-06). */
  readOnly?: boolean;
  /** Claude Code session to continue a follow-up question in. */
  resume?: string;
}

/**
 * The argument vector for a headless run (UI-02, UI-06). Claude Code may use only the tools the
 * run needs and is refused anything else without a prompt (`dontAsk`); Codex runs in a sandbox.
 * No vector skips the agent's permission checks (SAF-04).
 */
export function headlessArgs(cli: "claude" | "codex", prompt: string, options: HeadlessOptions): string[] {
  if (cli === "codex") return ["exec", "--json", "--sandbox", options.readOnly ? "read-only" : "workspace-write", prompt];
  const tools = options.readOnly
    ? ["Read", "Grep", "Glob"]
    : [
        "Read",
        "Grep",
        "Glob",
        `Bash(node ${options.skillDir}/scripts/repo-facts.mjs *)`,
        `Bash(node ${options.skillDir}/scripts/validate.mjs *)`,
        "Edit(./.archify/**)",
      ];
  const resume = options.resume === undefined ? [] : ["--resume", options.resume];
  return ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", ...resume, "--allowedTools", ...tools];
}

/** `/sustain-architecture <focus>` or `$sustain-architecture <focus>`; no trailing space for an empty focus. */
export function agentPrompt(agent: Agent, focus: string): string {
  const trimmed = focus.trim();
  return trimmed === "" ? agent.invoke : `${agent.invoke} ${trimmed}`;
}
