// UI-02: `codex exec --json` events as feed items. Codex reports no final result line, so the
// runner judges success by the exit code.
import { clip, commandItem, NO_USAGE, validatorItem, type FeedItem, type StreamParser, type StreamUpdate, type StreamUsage } from "./feed";

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function codexParser(): StreamParser {
  const total: StreamUsage = { ...NO_USAGE };
  return {
    line(raw: string): StreamUpdate {
      let event: Json;
      try {
        event = record(JSON.parse(raw));
      } catch {
        return { items: [] };
      }
      const item = record(event["item"]);
      switch (event["type"]) {
        case "item.started":
          return item["type"] === "command_execution" ? { items: [commandItem(text(item["command"]))] } : { items: [] };
        case "item.completed": {
          if (item["type"] === "command_execution") {
            const verdict = validatorItem(text(item["aggregated_output"]));
            return { items: verdict ? [verdict] : [] };
          }
          if (item["type"] === "file_change") {
            const items: FeedItem[] = (Array.isArray(item["changes"]) ? item["changes"] : []).map((change) => {
              const path = text(record(change)["path"]);
              return { kind: "write", text: path.endsWith("draft.json") ? "Writing the draft" : `Writing ${path}` };
            });
            return { items };
          }
          if (item["type"] === "agent_message" && text(item["text"]).trim() !== "") {
            return { items: [{ kind: "message", text: clip(text(item["text"])) }], answer: text(item["text"]) };
          }
          return { items: [] };
        }
        case "turn.completed": {
          const usage = record(event["usage"]);
          // Codex's input count includes its cached input, and its output count includes reasoning.
          const cached = count(usage["cached_input_tokens"]);
          total.input += Math.max(0, count(usage["input_tokens"]) - cached);
          total.cacheRead += cached;
          total.output += count(usage["output_tokens"]);
          return { items: [], usage: { ...total } };
        }
        case "turn.failed":
          return { items: [{ kind: "error", text: clip(text(record(event["error"])["message"]) || "The turn failed") }] };
        case "error":
          return { items: [{ kind: "error", text: clip(text(event["message"]) || "Codex reported an error") }] };
        default:
          return { items: [] };
      }
    },
  };
}
