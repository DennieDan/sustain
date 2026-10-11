// Messages between the extension host and the architecture webview (FR-VIEW-04). Types only.

/** Host → webview. `doc` is the parsed diagram JSON; `file` its absolute path. */
export type HostMessage = { type: "load"; doc: unknown; file: string } | { type: "empty"; message: string };

/** Webview → host. `index` is into the component's tolerant `sources` list. */
export type WebviewMessage = { type: "ready" } | { type: "openSource"; componentId: string; index: number };
