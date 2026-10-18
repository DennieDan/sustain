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

/** The skills a run launches (FR-GEN-01, FRS-05). */
export type SkillName = "sustain-architecture" | "sustain-refresh" | "sustain-audit";

/** The scripts each skill runs, which its Bash rules name exactly. */
export const SKILL_SCRIPTS: Readonly<Record<SkillName, readonly string[]>> = {
  "sustain-architecture": ["repo-facts.mjs", "validate.mjs", "render-html.mjs"],
  "sustain-refresh": ["refresh-facts.mjs", "validate.mjs", "render-html.mjs"],
  "sustain-audit": ["audit-record.mjs"],
};

export interface HeadlessOptions {
  /** The skill folder the agent loads, for the exact script rules. */
  skillDir: string;
  /** The scripts the run may start; the architecture skill's by default. */
  scripts?: readonly string[];
  /** A question run: read and search tools only (UI-06). */
  readOnly?: boolean;
  /** Claude Code session to continue a follow-up question in. */
  resume?: string;
  /** Lets Claude Code give work to fresh subagents with its Task tool, as the audit does (ACC-05). */
  subagents?: boolean;
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
        ...(options.subagents ? ["Task"] : []),
        ...(options.scripts ?? SKILL_SCRIPTS["sustain-architecture"]).map((script) => `Bash(node ${options.skillDir}/scripts/${script} *)`),
        "Edit(./.archify/**)",
      ];
  const resume = options.resume === undefined ? [] : ["--resume", options.resume];
  return ["-p", prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "dontAsk", ...resume, "--allowedTools", ...tools];
}

/** `/sustain-architecture <focus>` or `$sustain-architecture <focus>`; no trailing space for an empty focus. */
export function agentPrompt(agent: Agent, focus: string): string {
  return skillPrompt(agent.cli, "sustain-architecture", focus);
}

/** `/<skill> <args>` for Claude Code or `$<skill> <args>` for Codex; no trailing space without arguments. */
export function skillPrompt(cli: "claude" | "codex", skill: SkillName, args: string): string {
  const invoke = `${cli === "claude" ? "/" : "$"}${skill}`;
  const trimmed = args.trim();
  return trimmed === "" ? invoke : `${invoke} ${trimmed}`;
}
