// VWR-04: the map for the keyboard and for screen readers. Each box's accessible name says what it
// is and which code it opens; a visually hidden list names every box and arrow, and its buttons
// open the code as a click on the box does.
import type { WebviewMessage } from "../src/model/messages";
import type { ViewComponent, ViewDiagram } from "../src/model/tolerant";

function cite(source: ViewComponent["sources"][number]): string {
  return `${source.path}${source.line === undefined ? "" : `:${source.line}${source.end_line === undefined ? "" : `-${source.end_line}`}`}`;
}

/** A box's accessible name: its label and sublabel, then the code it opens when it cites any. */
export function boxName(component: ViewComponent): string {
  const what = component.sublabel ? `${component.label}, ${component.sublabel}` : component.label;
  const first = component.sources[0];
  return first === undefined ? what : `${what}. Opens ${cite(first)}`;
}

/** The hidden list of `diagram`'s boxes and arrows, for screen readers. */
export function screenReaderList(diagram: ViewDiagram, post: (message: WebviewMessage) => void): HTMLElement {
  const root = document.createElement("div");
  root.className = "sr-only sr-map";
  const heading = (text: string): HTMLElement => {
    const node = document.createElement("h2");
    node.textContent = text;
    return node;
  };
  const boxes = document.createElement("ul");
  boxes.setAttribute("aria-label", "Boxes");
  for (const component of diagram.components) {
    const item = document.createElement("li");
    if (component.sources.length > 0) {
      const open = document.createElement("button");
      open.type = "button";
      open.textContent = boxName(component);
      open.addEventListener("click", () => post({ type: "openSource", componentId: component.id, index: 0 }));
      item.append(open);
    } else {
      item.textContent = boxName(component);
    }
    boxes.append(item);
  }
  const labels = new Map(diagram.components.map((component) => [component.id, component.label]));
  const arrows = document.createElement("ul");
  arrows.setAttribute("aria-label", "Arrows");
  for (const connection of diagram.connections) {
    const item = document.createElement("li");
    item.textContent = `${labels.get(connection.from) ?? connection.from} to ${labels.get(connection.to) ?? connection.to}${connection.label ? `, ${connection.label}` : ""}`;
    arrows.append(item);
  }
  const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : word.endsWith("x") ? "es" : "s"}`;
  root.append(heading(count(diagram.components.length, "box")), boxes, heading(count(diagram.connections.length, "arrow")), arrows);
  return root;
}
