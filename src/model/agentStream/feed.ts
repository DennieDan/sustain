// UI-02: what a headless agent run shows in the sidebar, whichever agent produced it.

export type FeedKind = "read" | "search" | "write" | "command" | "validate" | "message" | "error";

/** One line of the run card's activity feed. */
export interface FeedItem {
  kind: FeedKind;
  text: string;
}

export interface StreamUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** What the agent reported when it finished. */
export interface StreamEnd {
  ok: boolean;
  /** Cost the agent reported, a client-side estimate for Claude Code. */
  costUsd: number | null;
  /** Tools the agent was not allowed to use, as "Tool: detail". */
  denials: string[];
  /** The session to resume for a follow-up question. */
  sessionId: string | null;
  /** The agent's final reply, which replaces the text streamed before it (UI-06). */
  finalAnswer?: string;
}

/** What one line of agent output adds. `usage` replaces the running total; `answer` is text to show in Ask. */
export interface StreamUpdate {
  items: FeedItem[];
  usage?: StreamUsage;
  answer?: string;
  end?: StreamEnd;
}

export const NO_USAGE: StreamUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/** A parser keeps its own running state across the lines of one run. */
export interface StreamParser {
  line(text: string): StreamUpdate;
}

/** `text` cut to `max` characters with an ellipsis. */
export function clip(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** The feed item for a shell command, with Sustain's own scripts named by what they do. */
export function commandItem(command: string): FeedItem {
  if (/validate\.mjs/.test(command)) return { kind: "validate", text: "Validating the draft" };
  if (/repo-facts\.mjs/.test(command)) return { kind: "command", text: "Creating the run folder" };
  if (/refresh-facts\.mjs/.test(command)) return { kind: "command", text: "Finding what changed" };
  return { kind: "command", text: `Running ${clip(command, 80)}` };
}

/** The feed item for a validator report printed as JSON, or `null` when `output` is not one. */
export function validatorItem(output: string): FeedItem | null {
  let report: unknown;
  try {
    report = JSON.parse(output.trim());
  } catch {
    return null;
  }
  if (typeof report !== "object" || report === null) return null;
  const { status, errors } = report as { status?: unknown; errors?: unknown };
  if (status === "accepted") return { kind: "validate", text: "Accepted" };
  if (status === "rejected") {
    const count = Array.isArray(errors) ? errors.length : 0;
    return { kind: "validate", text: `Rejected with ${count} error${count === 1 ? "" : "s"}, repairing` };
  }
  return null;
}
