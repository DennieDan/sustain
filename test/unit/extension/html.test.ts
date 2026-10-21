// NFR-SEC-01: the webview's Content Security Policy and HTML shell.
import { describe, expect, test } from "vitest";
import { webviewCsp, webviewHtml } from "../../../src/extension/html";

const assets = {
  cspSource: "https://file+.vscode-resource.vscode-cdn.net",
  nonce: "n0nce123",
  scriptUri: "https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview.js",
  styleUri: "https://file+.vscode-resource.vscode-cdn.net/ext/dist/webview.css",
};

describe("NFR-SEC-01 webview CSP", () => {
  test("VWR-02 the policy is exactly default-src none, a nonce'd script, the extension's styles and workers from Blob URLs", () => {
    expect(webviewCsp(assets.cspSource, assets.nonce)).toBe(
      "default-src 'none'; script-src 'nonce-n0nce123'; style-src https://file+.vscode-resource.vscode-cdn.net; worker-src blob:",
    );
  });

  test("no unsafe-eval, unsafe-inline or remote wildcard", () => {
    const csp = webviewCsp(assets.cspSource, assets.nonce);
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|\*|https?:\s|data:/);
  });

  test("the HTML carries the policy, one nonce'd script from dist/webview.js and the dist stylesheet", () => {
    const html = webviewHtml(assets);
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${webviewCsp(assets.cspSource, assets.nonce)}">`);
    expect(html.match(/<script\b[^>]*>/g)).toEqual([`<script nonce="n0nce123" src="${assets.scriptUri}">`]);
    expect(html.match(/<link\b[^>]*>/g)).toEqual([`<link rel="stylesheet" href="${assets.styleUri}">`]);
    expect(html).not.toMatch(/<style\b|\sstyle=|\son[a-z]+=/i);
  });

  test("attribute values are escaped", () => {
    const html = webviewHtml({ ...assets, styleUri: 'x"><script>' });
    expect(html).toContain('href="x&quot;>&lt;script>"');
  });
});
