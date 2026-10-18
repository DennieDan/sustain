// UI-02: the run card's state, built from an agent's output as it arrives.
import { NO_USAGE, type FeedItem, type StreamParser, type StreamUsage } from "./feed";

/** The feed keeps this many latest items. */
export const FEED_LIMIT = 50;

export type RunStatus = "running" | "done" | "failed" | "cancelled";

export interface RunState {
  status: RunStatus;
  feed: FeedItem[];
  usage: StreamUsage;
  costUsd: number | null;
  denials: string[];
  sessionId: string | null;
  /** The agent's own text, for a question run. */
  answer: string;
  startedAt: string;
  finishedAt: string | null;
}

export class RunTracker {
  private buffer = "";
  readonly state: RunState;

  constructor(
    private readonly parser: StreamParser,
    now = new Date(),
  ) {
    this.state = { status: "running", feed: [], usage: { ...NO_USAGE }, costUsd: null, denials: [], sessionId: null, answer: "", startedAt: now.toISOString(), finishedAt: null };
  }

  /** Feeds a chunk of stdout. A line split across chunks waits for its end. */
  push(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim() !== "") this.apply(line);
  }

  private apply(line: string): void {
    const update = this.parser.line(line);
    this.state.feed.push(...update.items);
    if (this.state.feed.length > FEED_LIMIT) this.state.feed.splice(0, this.state.feed.length - FEED_LIMIT);
    if (update.usage) this.state.usage = update.usage;
    // Separate messages are separate paragraphs.
    if (update.answer) this.state.answer += (this.state.answer === "" ? "" : "\n\n") + update.answer;
    if (update.end) {
      this.state.costUsd = update.end.costUsd;
      this.state.denials = update.end.denials;
      this.state.sessionId = update.end.sessionId;
      if (update.end.finalAnswer !== undefined) this.state.answer = update.end.finalAnswer;
      if (!update.end.ok) this.state.status = "failed";
    }
  }

  /** Records the process exit. A cancel wins, then any failure the agent reported, then the exit code. */
  finish(exitCode: number | null, cancelled: boolean, now = new Date()): RunState {
    if (this.buffer.trim() !== "") this.apply(this.buffer);
    this.buffer = "";
    if (cancelled) this.state.status = "cancelled";
    else if (this.state.status === "running") this.state.status = exitCode === 0 ? "done" : "failed";
    this.state.finishedAt = now.toISOString();
    return this.state;
  }
}
