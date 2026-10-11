// Agent launch details for `Sustain: Generate Architecture` (FR-GEN-01). No `vscode` import,
// so the prompt format and PATH lookup are unit-tested in Node.
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

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

/** `/sustain-architecture <focus>` or `$sustain-architecture <focus>`; no trailing space for an empty focus. */
export function agentPrompt(agent: Agent, focus: string): string {
  const trimmed = focus.trim();
  return trimmed === "" ? agent.invoke : `${agent.invoke} ${trimmed}`;
}

function isExecutableFile(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== "win32") accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The first executable `cli` on `env.PATH` (with each `env.PATHEXT` extension on Windows),
 * or `undefined`.
 */
export function findOnPath(cli: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): string | undefined {
  const pathValue = env["PATH"] ?? env["Path"] ?? "";
  const extensions = platform === "win32" ? ["", ...(env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)] : [""];
  for (const dir of pathValue.split(platform === "win32" ? ";" : delimiter)) {
    if (dir === "") continue;
    for (const extension of extensions) {
      const candidate = join(dir, cli + extension);
      if (isExecutableFile(candidate, platform)) return candidate;
    }
  }
  return undefined;
}
