// CLD-08: the docs pages' markdown, parsed into blocks the page renders as React elements. Nothing
// is ever treated as HTML. Covers headings, paragraphs, lists, fenced code, tables, quotes and rules.

export type Inline = { kind: "text"; text: string } | { kind: "code"; text: string } | { kind: "strong"; text: string } | { kind: "em"; text: string } | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: number; id: string; spans: Inline[] }
  | { kind: "paragraph"; spans: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "code"; lang: string; text: string }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "quote"; spans: Inline[] }
  | { kind: "rule" };

/** A heading's anchor, as GitHub makes them. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Where a link goes: http(s) and mailto as they are; a relative `.md` link to its docs page; an
 * anchor as it is. Anything else, such as `javascript:`, becomes `null` and renders as text.
 */
export function linkTarget(href: string, docPath: (path: string) => string | null): string | null {
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("#")) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  const [path, anchor] = href.split("#") as [string, string | undefined];
  const page = docPath(path);
  return page === null ? null : `${page}${anchor ? `#${anchor}` : ""}`;
}

/** A link target may hold one level of parentheses, as GitHub allows. */
const TARGET = String.raw`(?:[^()\s]|\([^()\s]*\))+`;
const INLINE = new RegExp(String.raw`(\`[^\`]+\`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\(${TARGET}\))`, "g");

export function inline(text: string, docPath: (path: string) => string | null): Inline[] {
  const spans: Inline[] = [];
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > at) spans.push({ kind: "text", text: text.slice(at, match.index) });
    const token = match[0];
    if (match[1]) spans.push({ kind: "code", text: token.slice(1, -1) });
    else if (match[2]) spans.push({ kind: "strong", text: token.slice(2, -2) });
    else if (match[3]) spans.push({ kind: "em", text: token.slice(1, -1) });
    else {
      const link = new RegExp(String.raw`^\[([^\]]+)\]\((${TARGET})\)$`).exec(token)!;
      const href = linkTarget(link[2]!, docPath);
      spans.push(href === null ? { kind: "text", text: link[1]! } : { kind: "link", text: link[1]!, href });
    }
    at = match.index + token.length;
  }
  if (at < text.length) spans.push({ kind: "text", text: text.slice(at) });
  return spans;
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

export function parseMarkdown(source: string, docPath: (path: string) => string | null = () => null): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", spans: inline(paragraph.join(" "), docPath) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fence = /^\s*```(\S*)/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]!); i++) code.push(lines[i]!);
      blocks.push({ kind: "code", lang: fence[1] ?? "", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1]!.length, id: slug(heading[2]!), spans: inline(heading[2]!, docPath) });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flush();
      const head = cells(line).map((cell) => inline(cell, docPath));
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!); i++) rows.push(cells(lines[i]!).map((cell) => inline(cell, docPath)));
      i -= 1;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = item[2] !== undefined;
      const last = blocks.at(-1);
      const list = last?.kind === "list" && last.ordered === ordered ? last : { kind: "list" as const, ordered, items: [] as Inline[][] };
      if (list !== last) blocks.push(list);
      list.items.push(inline(item[3]!, docPath));
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flush();
      blocks.push({ kind: "quote", spans: inline(line.replace(/^\s*>\s?/, ""), docPath) });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    if (line.trim() === "") flush();
    else paragraph.push(line.trim());
  }
  flush();
  return blocks;
}
