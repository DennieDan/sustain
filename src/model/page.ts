// RCH-01: the diagram page, one HTML file that draws a map offline. The map's JSON sits in a data
// script with markup characters escaped; the viewer and its styles are inline and allowed by their
// SHA-256 hashes, so nothing else can run or load.
import { createHash } from "node:crypto";
import type { HostMessage } from "./messages";
import type { Repository } from "./types";

/** The bundled page script and stylesheet. */
export interface PageAssets {
  script: string;
  style: string;
}

/** What the page script reads from its data script. */
export interface PageData {
  title: string;
  doc: unknown;
  /** The repository's absolute path, only in a page made for this machine. */
  root: string | null;
  project: string | null;
  repository: Repository | null;
  /** Messages delivered after the map, such as freshness, an overlay or ghost boxes (CLD-03, CLD-04). */
  messages?: HostMessage[];
}

/** JSON safe inside a script element: `<`, `>`, `&`, U+2028 and U+2029 as escapes. */
export function escapeJson(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

/** The page's Content Security Policy: nothing but its own inline script and style. */
export function pageCsp(assets: PageAssets): string {
  return `default-src 'none'; script-src 'sha256-${sha256(assets.script)}'; style-src 'sha256-${sha256(assets.style)}'`;
}

export function renderPage(data: PageData, assets: PageAssets): string {
  if (/<\/script/i.test(assets.script) || /<\/style/i.test(assets.style)) throw new Error("the page assets must not close their own element");
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="UTF-8">',
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtml(pageCsp(assets))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `<title>${escapeHtml(data.title)}</title>`,
    `<style>${assets.style}</style>`,
    "</head>",
    "<body>",
    `<script type="application/json" id="sustain-data">${escapeJson(JSON.stringify(data))}</script>`,
    `<script>${assets.script}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}

/** The page's path inside its run folder: `meta.output` when it names one there, else `<run>/diagram.html`. */
export function pageOutput(run: string, doc: unknown): string {
  const meta = typeof doc === "object" && doc !== null ? (doc as { meta?: { output?: unknown } }).meta : undefined;
  const output = typeof meta?.output === "string" ? meta.output : "";
  const name = output.startsWith(`.archify/${run}/`) ? output.slice(`.archify/${run}/`.length) : "";
  return /^[a-z0-9][a-z0-9-]*\.html$/.test(name) ? name : "diagram.html";
}
