// VWR-01: the viewer reaches the host it runs in only through here. The host is the VS Code
// webview, the diagram page or the cloud site; each installs itself before the viewer starts.
import type { HostMessage, WebviewMessage } from "../src/model/messages";

export interface Host {
  post(message: WebviewMessage): void;
  /** Calls `handler` with every message the host sends. */
  listen(handler: (message: HostMessage) => void): void;
}

let current: Host | undefined;

export function useHost(host: Host): void {
  current = host;
}

function host(): Host {
  if (current === undefined) throw new Error("the viewer started before its host was installed");
  return current;
}

export function post(message: WebviewMessage): void {
  host().post(message);
}

export function onMessage(handler: (message: HostMessage) => void): void {
  host().listen(handler);
}

/** Sets the viewer's `--sustain-*` tokens on `element`. */
export function applyTokens(element: HTMLElement, tokens: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(tokens)) element.style.setProperty(name, value);
}
