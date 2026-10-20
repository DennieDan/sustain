// SET-02: what a first Generate needs, each check with one fix.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { findOnPath } from "./which";

export type CheckId = "node" | "claude" | "codex" | "devin" | "skills" | "git";

export type Fix =
  | { kind: "install-skills"; label: string }
  | { kind: "copy"; label: string; text: string }
  | { kind: "open"; label: string; url: string };

export interface Check {
  id: CheckId;
  ok: boolean;
  /** What was found, such as a version, or what is missing. */
  detail: string;
  /** One action that fixes a failing check. */
  fix?: Fix;
}

/** The lowest Node version the skill scripts run on. */
export const MIN_NODE_MAJOR = 18;

/** The first `major.minor.patch` in `text`, or `null`. */
export function parseVersion(text: string): { major: number; minor: number; patch: number } | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

/** The first output line of `binary --version`, or `null` when it fails or takes over 5 s. */
function versionOf(binary: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], { stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 });
    let out = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (out += chunk));
    child.on("error", () => resolve(null));
    child.on("close", (code) => resolve(code === 0 ? out.trim().split("\n")[0]?.trim() || null : null));
  });
}

const AGENT_INSTALL: Record<"claude" | "codex" | "devin", Fix> = {
  claude: { kind: "copy", label: "Copy install command", text: "npm install -g @anthropic-ai/claude-code" },
  codex: { kind: "copy", label: "Copy install command", text: "npm install -g @openai/codex" },
  devin: { kind: "open", label: "Open Devin's install guide", url: "https://docs.devin.ai/cli" },
};

export interface PreflightInput {
  env: NodeJS.ProcessEnv;
  /** The repository the run is for. */
  root: string;
  /** Whether the skills the agents load match the shipped copy (SAF-01). */
  skillsIntact: boolean;
  /** Devin's CLI when found outside PATH, from its known install locations. */
  devinPath?: string;
}

/** Runs every setup check. Agents are found on absolute PATH entries only (SAF-04). */
export async function runPreflight(input: PreflightInput): Promise<Check[]> {
  const checks: Check[] = [];

  const nodeBinary = findOnPath("node", input.env);
  const nodeVersion = nodeBinary === undefined ? null : parseVersion((await versionOf(nodeBinary)) ?? "");
  checks.push(
    nodeVersion !== null && nodeVersion.major >= MIN_NODE_MAJOR
      ? { id: "node", ok: true, detail: `Node ${nodeVersion.major}.${nodeVersion.minor}.${nodeVersion.patch}` }
      : {
          id: "node",
          ok: false,
          detail: nodeVersion === null ? "Node was not found on PATH" : `Node ${nodeVersion.major} is older than ${MIN_NODE_MAJOR}`,
          fix: { kind: "open", label: "Get Node.js", url: "https://nodejs.org/" },
        },
  );

  for (const agent of ["claude", "codex", "devin"] as const) {
    const binary = findOnPath(agent, input.env) ?? (agent === "devin" ? input.devinPath : undefined);
    const version = binary === undefined ? null : await versionOf(binary);
    checks.push(
      binary === undefined
        ? { id: agent, ok: false, detail: `${agent} was not found`, fix: AGENT_INSTALL[agent] }
        : { id: agent, ok: true, detail: version ?? `${agent} found` },
    );
  }

  checks.push(
    input.skillsIntact
      ? { id: "skills", ok: true, detail: "Sustain's skills are installed and unchanged" }
      : { id: "skills", ok: false, detail: "Sustain's skills are missing or changed", fix: { kind: "install-skills", label: "Install skills" } },
  );

  checks.push(
    existsSync(join(input.root, ".git"))
      ? { id: "git", ok: true, detail: "Git repository" }
      : { id: "git", ok: false, detail: "Not a git repository. Refresh and the change overlay need one.", fix: { kind: "copy", label: "Copy git init", text: "git init" } },
  );
  return checks;
}
