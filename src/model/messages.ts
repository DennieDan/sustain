// Messages between the extension host and the architecture webview (FR-VIEW-04, FR-CMP-05,
// FR-CMP-07). Types only.
import type { ComparisonContext } from "./comparison";
import type { RunChanges } from "./runChanges";

/** The baseline the open diagram is compared with, and what the host knows about the pair. */
export interface Compare {
  /** Parsed baseline JSON; the webview runs the tolerant parse on it. */
  baselineDoc: unknown;
  /** Absolute path of the baseline diagram (normally a `candidate.sir`). */
  baselineFile: string;
  context: ComparisonContext;
  /** The open run's `changes.json` when `context.keptAvailable`, else `null`. */
  changes: RunChanges | null;
}

/** Host → webview. `doc` is the parsed diagram JSON; `file` its absolute path. */
export type HostMessage = { type: "load"; doc: unknown; file: string; compare: Compare | null } | { type: "empty"; message: string };

/**
 * Webview → host. `index` is into the component's tolerant `sources` list; `path` is a
 * repo-relative path from the `changes` last sent.
 */
export type WebviewMessage =
  | { type: "ready" }
  | { type: "openSource"; componentId: string; index: number }
  | { type: "compareWith" }
  | { type: "openBaseline" }
  | { type: "swap" }
  | { type: "openFile"; path: string };
