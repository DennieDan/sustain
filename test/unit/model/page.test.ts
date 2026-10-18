// RCH-01: the page embeds the map as escaped JSON and allows only its own inline script and style.
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { escapeJson, pageOutput, renderPage } from "../../../src/model/page";

const ASSETS = { script: "console.log('viewer')", style: "body{margin:0}" };
const HOSTILE = "</script><img src=x onerror=alert(1)>\u2028&";

function hash(text: string): string {
  return createHash("sha256").update(text).digest("base64");
}

describe("RCH-01 page assembly", () => {
  test("markup characters and line separators are escaped inside the data", () => {
    const escaped = escapeJson(JSON.stringify({ label: HOSTILE }));
    expect(escaped).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(escaped)).toEqual({ label: HOSTILE });
  });

  test("VWR-02 the CSP allows exactly the inline script and style by hash and workers from Blob URLs, and nothing else", () => {
    const html = renderPage({ title: HOSTILE, doc: { meta: { title: HOSTILE } }, root: null, project: null, repository: null }, ASSETS);
    expect(html).toContain(`default-src 'none'; script-src 'sha256-${hash(ASSETS.script)}'; style-src 'sha256-${hash(ASSETS.style)}'; worker-src blob:"`);
    expect(html).toContain(`<script>${ASSETS.script}</script>`);
    expect(html).toContain(`<style>${ASSETS.style}</style>`);
    expect(html.match(/<script/g)).toHaveLength(2);
    expect(html).not.toContain("<img");
    expect(html).toContain("<title>&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;");
  });

  test("assets that would close their own element are refused", () => {
    expect(() => renderPage({ title: "t", doc: {}, root: null, project: null, repository: null }, { script: "'</script>'", style: "" })).toThrow();
  });

  test("the page goes where meta.output says inside its run folder, else diagram.html", () => {
    expect(pageOutput("architecture-a-20261018-120000", { meta: { output: ".archify/architecture-a-20261018-120000/a.html" } })).toBe("a.html");
    expect(pageOutput("architecture-a-20261018-120000", { meta: { output: "../../evil.html" } })).toBe("diagram.html");
    expect(pageOutput("architecture-a-20261018-120000", {})).toBe("diagram.html");
  });
});
