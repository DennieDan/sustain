// CLD-08: the docs renderer's links: web links and published pages only, never a script URL.
import { expect, test } from "vitest";
import { docPath } from "../../src/lib/docs";
import { inline, linkTarget, parseMarkdown } from "../../src/lib/markdown";

test("CLD-08 links go to the web, to anchors or to published docs; script URLs become text", () => {
  const page = (path: string): string | null => docPath("README.md", path);
  expect(linkTarget("https://example.com/a", page)).toBe("https://example.com/a");
  expect(linkTarget("#setup", page)).toBe("#setup");
  expect(linkTarget("docs/architecture.md#modules", page)).toBe("/docs/architecture#modules");
  expect(linkTarget("docs/progress-v0.3.md", page)).toBeNull();
  expect(linkTarget("javascript:alert(1)", page)).toBeNull();
  expect(linkTarget("JaVaScRiPt:alert(1)", page)).toBeNull();
  expect(inline("[x](javascript:alert(1)) and `code`", page)).toEqual([
    { kind: "text", text: "x" },
    { kind: "text", text: " and " },
    { kind: "code", text: "code" },
  ]);
  expect(docPath("docs/spec-v0.3.md", "../README.md")).toBe("/docs");
});

test("CLD-08 headings, tables, lists and fences parse; markup stays text", () => {
  const blocks = parseMarkdown("# Title <b>x</b>\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two\n\n```ts\n<script>\n```");
  expect(blocks.map((block) => block.kind)).toEqual(["heading", "table", "list", "code"]);
  expect(blocks[0]).toMatchObject({ level: 1, id: "title-bxb", spans: [{ kind: "text", text: "Title <b>x</b>" }] });
  expect(blocks[3]).toEqual({ kind: "code", lang: "ts", text: "<script>" });
});
