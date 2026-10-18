// UI-02: Claude Code's `--output-format stream-json` lines as feed items.
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

function usageOf(value: unknown): StreamUsage {
  const usage = record(value);
  return {
    input: count(usage["input_tokens"]),
    output: count(usage["output_tokens"]),
    cacheRead: count(usage["cache_read_input_tokens"]),
    cacheWrite: count(usage["cache_creation_input_tokens"]),
  };
}

/** The feed item for one tool call. */
function toolItem(name: string, input: Json): FeedItem {
  const path = text(input["file_path"]) || text(input["path"]);
  switch (name) {
    case "Read":
      return { kind: "read", text: `Reading ${path}` };
    case "Grep":
    case "Glob":
      return { kind: "search", text: `Searching for ${clip(text(input["pattern"]), 60)}` };
    case "Write":
    case "Edit":
      return { kind: "write", text: path.endsWith("draft.json") ? "Writing the draft" : `Writing ${path}` };
    case "Bash":
      return commandItem(text(input["command"]));
    default:
      return { kind: "command", text: `Using ${name}` };
  }
}

/** The text content of a tool result, which may be a string or a list of text blocks. */
function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((block) => text(record(block)["text"])).join("\n");
  return "";
}

export function claudeParser(): StreamParser {
  const total: StreamUsage = { ...NO_USAGE };
  return {
    line(raw: string): StreamUpdate {
      let event: Json;
      try {
        event = record(JSON.parse(raw));
      } catch {
        return { items: [] };
      }
      const message = record(event["message"]);
      const content = Array.isArray(message["content"]) ? message["content"].map(record) : [];
      switch (event["type"]) {
        case "assistant": {
          const items: FeedItem[] = [];
          let answer = "";
          for (const block of content) {
            if (block["type"] === "tool_use") items.push(toolItem(text(block["name"]), record(block["input"])));
            if (block["type"] === "text" && text(block["text"]).trim() !== "") {
              items.push({ kind: "message", text: clip(text(block["text"])) });
              answer += text(block["text"]);
            }
          }
          const step = usageOf(message["usage"]);
          total.input += step.input;
          total.output += step.output;
          total.cacheRead += step.cacheRead;
          total.cacheWrite += step.cacheWrite;
          return { items, usage: { ...total }, ...(answer === "" ? {} : { answer }) };
        }
        case "user": {
          const items = content.filter((block) => block["type"] === "tool_result").flatMap((block) => validatorItem(resultText(block["content"])) ?? []);
          return { items };
        }
        case "result": {
          const denials = (Array.isArray(event["permission_denials"]) ? event["permission_denials"] : []).map((denial) => {
            const entry = record(denial);
            const input = record(entry["tool_input"]);
            return `${text(entry["tool_name"])}: ${clip(text(input["command"]) || text(input["file_path"]) || "", 80)}`;
          });
          const ok = event["subtype"] === "success" && event["is_error"] !== true;
          return {
            items: ok ? [] : [{ kind: "error", text: clip(text(event["result"]) || `The run ended with ${text(event["subtype"])}`) }],
            usage: event["usage"] === undefined ? { ...total } : usageOf(event["usage"]),
            end: {
              ok,
              costUsd: typeof event["total_cost_usd"] === "number" ? event["total_cost_usd"] : null,
              denials,
              sessionId: text(event["session_id"]) || null,
              ...(ok && text(event["result"]).trim() !== "" ? { finalAnswer: text(event["result"]) } : {}),
            },
          };
        }
        default:
          return { items: [] };
      }
    },
  };
}
