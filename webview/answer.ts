// UI-06: renders an answer's blocks as DOM nodes. Text only ever goes in as text; citations and
// box names become buttons that ask the host, which checks them again.
import type { Block, Span } from "../src/model/ask";
import type { HomeWebviewMessage } from "../src/model/messages";

/** One span as a DOM node; a citation or box name becomes a button that asks the host. */
export function spanNode(span: Span, post: (message: HomeWebviewMessage) => void): Node {
  switch (span.kind) {
    case "text":
      return document.createTextNode(span.text);
    case "code": {
      const code = document.createElement("code");
      code.textContent = span.text;
      return code;
    }
    case "cite": {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "cite";
      link.textContent = span.text;
      link.title = `Open ${span.path} at line ${span.line}`;
      link.addEventListener("click", () => post({ type: "openCitation", path: span.path, line: span.line, endLine: span.endLine }));
      return link;
    }
    case "box": {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "box-link";
      link.textContent = span.text;
      link.title = "Show this box on the map";
      link.addEventListener("click", () => post({ type: "focusBox", id: span.id }));
      return link;
    }
  }
}

function inline(parent: HTMLElement, spans: Span[], post: (message: HomeWebviewMessage) => void): HTMLElement {
  for (const span of spans) parent.append(spanNode(span, post));
  return parent;
}

/** The answer as `p`, `ul`/`ol` and `pre > code` elements in a `div.answer`. */
export function renderAnswer(blocks: readonly Block[], post: (message: HomeWebviewMessage) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "answer";
  for (const block of blocks) {
    if (block.kind === "paragraph") root.append(inline(document.createElement("p"), block.spans, post));
    else if (block.kind === "list") {
      const list = document.createElement(block.ordered ? "ol" : "ul");
      for (const item of block.items) list.append(inline(document.createElement("li"), item, post));
      root.append(list);
    } else {
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = block.text;
      pre.append(code);
      root.append(pre);
    }
  }
  return root;
}
