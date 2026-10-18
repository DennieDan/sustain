// IDE-01: the viewer in the IntelliJ plugin's JCEF browser. The plugin's page defines
// `window.sustainPost(json)` before the viewer's script, which hands a message to Kotlin through a
// JBCefJSQuery, and sets `window.sustainDark` from the IDE's theme. The plugin sends its messages by
// calling `window.sustainReceive(message)`.
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import { applyTokens, type Host } from "../bridge";
import { DARK, LIGHT } from "./standalone";

/** What the plugin's page puts on `window` for the host. */
export interface JcefWindow {
  sustainPost?: (json: string) => void;
  sustainReceive?: (message: HostMessage) => void;
  sustainDark?: boolean;
}

export function jcefHost(page: JcefWindow = window as unknown as JcefWindow, body: HTMLElement = document.body): Host {
  applyTokens(body, page.sustainDark === true ? DARK : LIGHT);
  return {
    post: (message: WebviewMessage) => page.sustainPost?.(JSON.stringify(message)),
    listen: (handler) => {
      page.sustainReceive = handler;
    },
  };
}
