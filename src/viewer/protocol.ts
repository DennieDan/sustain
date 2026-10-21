// Messages between the extension host and the diagram viewer (FR-VIEW-04, FR-CMP-05, FR-CMP-07).
// Types only.
import type { ComparisonContext } from "../core/comparison";
import type { RunChanges } from "../core/runChanges";

/** The baseline the open diagram is compared with, and what the host knows about the pair (FR-CMP-05). */
export interface Compare {
  /** Parsed baseline JSON; the webview runs the tolerant parse on it. */
  baselineDoc: unknown;
  /** Absolute path of the baseline diagram (normally a `candidate.sir`). */
  baselineFile: string;
  context: ComparisonContext;
  /** The open run's `changes.json` when `context.keptAvailable`, else `null`. */
  changes: RunChanges | null;
}

/**
 * Host → architecture webview. `doc` is the parsed diagram JSON; `file` its absolute path. An
 * empty state may offer to map the folder (UI-03).
 */
export type HostMessage =
  | { type: "load"; doc: unknown; file: string; compare?: Compare | null }
  | { type: "empty"; message: string; action?: "mapFolder" };

/**
 * Architecture webview → host. `index` is into the component's tolerant `sources` list; `path` in
 * `openFile` is a repo-relative path from the `changes` last sent (FR-CMP-07).
 */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openSource"; componentId: string; index: number }
  | { type: "compareWith" }
  | { type: "openBaseline" }
  | { type: "swap" }
  | { type: "openFile"; path: string }
  | { type: "mapFolder" };
