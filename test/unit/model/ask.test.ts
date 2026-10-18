// UI-06: the Ask prompt, and the answer's structure, citations and box links.
import { describe, expect, test } from "vitest";
import { askPrompt, citesOf, inlineSpans, keepCites, parseAnswer } from "../../../src/model/ask";

const BOXES = [
  { id: "panel", label: "Architecture panel" },
  { id: "arch", label: "Architecture" },
  { id: "ui", label: "UI" },
];

describe("UI-06 prompt", () => {
  test("the first question names the map, says to read it first and to cite path:line", () => {
    const prompt = askPrompt(".archify/architecture-x-20261018-120000/candidate.json", "  Where is Generate?  ");
    expect(prompt).toContain("First read the architecture map in .archify/architecture-x-20261018-120000/candidate.json");
    expect(prompt).toContain("Answer from the code the map cites");
    expect(prompt).toContain("Cite every claim as path:line");
    expect(prompt.endsWith("Question: Where is Generate?")).toBe(true);
  });

  test("a follow-up repeats only the citation rule", () => {
    expect(askPrompt("x", "And Cancel?", true)).toBe("And Cancel?\n\nCite every claim as path:line, relative to the repository root.");
  });
});

describe("UI-06 citations and boxes", () => {
  test("path:line and path:start-end become citations; times, ports and bare words do not", () => {
    const spans = inlineSpans("See src/extension/runner.ts:51-70 and ./README.md:3, not 12:30, localhost:8080 or Makefile:2.");
    expect(spans.filter((span) => span.kind === "cite")).toEqual([
      { kind: "cite", text: "src/extension/runner.ts:51-70", path: "src/extension/runner.ts", line: 51, endLine: 70 },
      { kind: "cite", text: "./README.md:3", path: "README.md", line: 3, endLine: null },
    ]);
  });

  test("a citation in backticks is a citation; other backticks are code", () => {
    expect(inlineSpans("`src/a.ts:4` runs `npm test`")).toEqual([
      { kind: "cite", text: "src/a.ts:4", path: "src/a.ts", line: 4, endLine: null },
      { kind: "text", text: " runs " },
      { kind: "code", text: "npm test" },
    ]);
  });

  test("box labels link to their box, the longest label first and only as whole words", () => {
    expect(inlineSpans("The Architecture panel uses Architecture, not UIs or GUI.", BOXES)).toEqual([
      { kind: "text", text: "The " },
      { kind: "box", text: "Architecture panel", id: "panel" },
      { kind: "text", text: " uses " },
      { kind: "box", text: "Architecture", id: "arch" },
      { kind: "text", text: ", not UIs or GUI." },
    ]);
  });

  test("an unpaired backtick stays text", () => {
    expect(inlineSpans("a `b")).toEqual([{ kind: "text", text: "a `b" }]);
  });
});

describe("UI-06 blocks", () => {
  test("paragraphs, ordered and unordered lists, fenced code and headings", () => {
    const blocks = parseAnswer("# Answer\nGenerate starts\nin the sidebar.\n\n- one\n  continued\n- two\n\n1. first\n2) second\n\n```ts\nconst x = `<b>`;\n```\ntail");
    expect(blocks).toEqual([
      { kind: "paragraph", spans: [{ kind: "text", text: "Answer Generate starts in the sidebar." }] },
      { kind: "list", ordered: false, items: [[{ kind: "text", text: "one continued" }], [{ kind: "text", text: "two" }]] },
      { kind: "list", ordered: true, items: [[{ kind: "text", text: "first" }], [{ kind: "text", text: "second" }]] },
      { kind: "code", text: "const x = `<b>`;" },
      { kind: "paragraph", spans: [{ kind: "text", text: "tail" }] },
    ]);
  });

  test("markup stays text: no block or span ever carries HTML", () => {
    const blocks = parseAnswer('<img src=x onerror="alert(1)"> **bold** <script>alert(2)</script>');
    expect(blocks).toEqual([{ kind: "paragraph", spans: [{ kind: "text", text: '<img src=x onerror="alert(1)"> bold <script>alert(2)</script>' }] }]);
  });

  test("an unclosed fence runs to the end", () => {
    expect(parseAnswer("```\na\nb")).toEqual([{ kind: "code", text: "a\nb" }]);
  });

  test("citations the host rejects turn back into text", () => {
    const blocks = parseAnswer("Real src/a.ts:1 and fake .env:2\n- item cites src/b.ts:3");
    expect(citesOf(blocks).map((cite) => cite.path)).toEqual(["src/a.ts", ".env", "src/b.ts"]);
    const kept = keepCites(blocks, (path) => path !== ".env");
    expect(citesOf(kept).map((cite) => cite.path)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(kept[0]).toEqual({
      kind: "paragraph",
      spans: [
        { kind: "text", text: "Real " },
        { kind: "cite", text: "src/a.ts:1", path: "src/a.ts", line: 1, endLine: null },
        { kind: "text", text: " and fake .env:2" },
      ],
    });
  });
});
