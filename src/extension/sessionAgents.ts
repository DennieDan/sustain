// LRN-01: the agents a learning session can run in, and the terminal's argument vector for each.
// No `vscode` import, so detection and argv are unit-tested in Node.
import { existsSync } from "node:fs";
import { findOnPath } from "../model/which";
import { devinPromptArgs, findDevinCli } from "./devin";
import type { SessionAgent } from "./hooksFiles";

export interface SessionLauncher {
  agent: SessionAgent;
  label: "Claude Code" | "Codex" | "Devin";
  /** The executable, by absolute path. */
  binary: string;
}

/** Claude Code and Codex on PATH, then Devin on PATH or where it installs, in that order. */
export function sessionAgents(env: NodeJS.ProcessEnv, exists: (path: string) => boolean = existsSync, platform: NodeJS.Platform = process.platform): SessionLauncher[] {
  const found: SessionLauncher[] = [];
  const claude = findOnPath("claude", env, platform);
  if (claude !== undefined) found.push({ agent: "claude", label: "Claude Code", binary: claude });
  const codex = findOnPath("codex", env, platform);
  if (codex !== undefined) found.push({ agent: "codex", label: "Codex", binary: codex });
  const devin = findDevinCli(env, exists, platform);
  if (devin !== undefined) found.push({ agent: "devin", label: "Devin", binary: devin });
  return found;
}

/** The skill invocation for `task`: `$sustain-bugfix` in Codex, `/sustain-bugfix` elsewhere. */
export function sessionPrompt(agent: SessionAgent, task: string): string {
  return `${agent === "codex" ? "$" : "/"}sustain-bugfix ${task.trim()}`;
}

/** The terminal's argument vector: the prompt alone, after `--` for Devin, and never a permission flag (SAF-04). */
export function sessionArgs(agent: SessionAgent, task: string): string[] {
  const prompt = sessionPrompt(agent, task);
  return agent === "devin" ? devinPromptArgs(prompt) : [prompt];
}
