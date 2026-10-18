// IDE-01: the viewer's JCEF host hands each viewer message to the plugin as JSON through
// `sustainPost`, delivers the plugin's messages from `sustainReceive`, and takes the IDE's palette.
import { describe, expect, test } from "vitest";
import type { HostMessage, WebviewMessage } from "../../src/model/messages";
import { jcefHost, type JcefWindow } from "../../webview/hosts/jcef";
import { DARK, LIGHT } from "../../webview/hosts/standalone";

describe("IDE-01 JCEF host", () => {
  test("the viewer's messages reach sustainPost as JSON, and sustainReceive's messages reach the viewer", () => {
    const sent: string[] = [];
    const page: JcefWindow = { sustainPost: (json) => sent.push(json) };
    const host = jcefHost(page, document.createElement("body"));
    const message: WebviewMessage = { type: "openSource", componentId: "api", index: 1 };
    host.post({ type: "ready" });
    host.post(message);
    expect(sent.map((json) => JSON.parse(json))).toEqual([{ type: "ready" }, message]);

    const received: HostMessage[] = [];
    host.listen((incoming) => received.push(incoming));
    page.sustainReceive!({ type: "find" });
    page.sustainReceive!({ type: "highlight", ids: ["api"], file: "src/api.ts", follow: false });
    expect(received).toEqual([{ type: "find" }, { type: "highlight", ids: ["api"], file: "src/api.ts", follow: false }]);
  });

  test("sustainDark picks the dark palette, and the light one otherwise", () => {
    const dark = document.createElement("body");
    jcefHost({ sustainDark: true }, dark);
    expect(dark.style.getPropertyValue("--sustain-background")).toBe(DARK["--sustain-background"]);
    const light = document.createElement("body");
    jcefHost({}, light);
    expect(light.style.getPropertyValue("--sustain-background")).toBe(LIGHT["--sustain-background"]);
  });
});
