// CST-06, PRC-05: what a headless run's transcript says, read with the same parsers as the sidebar
// (UI-02).
import type { StreamParser, StreamUsage } from "./feed";
import { NO_USAGE } from "./feed";

export interface StreamSummary {
  usage: StreamUsage;
  costUsd: number | null;
  reads: number;
  searches: number;
  writes: number;
  validations: number;
  ok: boolean | null;
  denials: string[];
  answer: string;
}

/** Every line of `transcript` through `parser`. Unlike the run card, nothing is dropped. */
export function summarizeStream(transcript: string, parser: StreamParser): StreamSummary {
  const summary: StreamSummary = { usage: { ...NO_USAGE }, costUsd: null, reads: 0, searches: 0, writes: 0, validations: 0, ok: null, denials: [], answer: "" };
  for (const line of transcript.split("\n")) {
    if (line.trim() === "") continue;
    const update = parser.line(line);
    for (const item of update.items) {
      if (item.kind === "read") summary.reads++;
      else if (item.kind === "search") summary.searches++;
      else if (item.kind === "write") summary.writes++;
      else if (item.kind === "validate" && item.text === "Validating the draft") summary.validations++;
    }
    if (update.usage) summary.usage = { ...update.usage };
    if (update.answer) summary.answer += update.answer;
    if (update.end) {
      summary.ok = update.end.ok;
      summary.costUsd = update.end.costUsd;
      summary.denials = update.end.denials;
      if (update.end.finalAnswer !== undefined) summary.answer = update.end.finalAnswer;
    }
  }
  return summary;
}
