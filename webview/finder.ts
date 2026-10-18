// VWR-03: the map's finder. Find, `/` or Ctrl/⌘+F opens it; typing marks the boxes whose label,
// sublabel or cited path contains the text, and dims the rest; Enter centres and zooms on the
// current match, the arrow keys move between matches, and Escape closes it.
import type { ViewDiagram } from "../src/model/tolerant";

/** What the finder needs from the viewer: marking boxes and centring on one. */
export interface FinderHost {
  /** Marks `ids` as found and `current` as the one in focus, or clears the marks for `null`. */
  mark(ids: readonly string[] | null, current: string | null): void;
  /** Centres and zooms the view on box `id`. */
  focus(id: string): void;
}

/** The ids of `diagram`'s boxes whose label, sublabel or cited path contains `query`, ignoring case. */
export function matchBoxes(diagram: ViewDiagram, query: string): string[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  return diagram.components
    .filter((component) => [component.label, component.sublabel ?? "", ...component.sources.map((source) => source.path)].some((text) => text.toLowerCase().includes(needle)))
    .map((component) => component.id);
}

export class Finder {
  /** The bar with the text box, the count, and Previous, Next and Close. */
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly count: HTMLElement;
  private diagram: ViewDiagram | null = null;
  private matches: string[] = [];
  private current = 0;

  constructor(private readonly host: FinderHost) {
    this.element = document.createElement("div");
    this.element.className = "finder";
    this.element.setAttribute("role", "search");
    this.element.hidden = true;
    this.input = document.createElement("input");
    this.input.type = "search";
    this.input.className = "finder__input";
    this.input.placeholder = "Find a box, a sublabel or a path";
    this.input.setAttribute("aria-label", "Find boxes");
    this.count = document.createElement("span");
    this.count.className = "finder__count";
    this.count.setAttribute("aria-live", "polite");
    const button = (text: string, label: string, onClick: () => void): HTMLButtonElement => {
      const node = document.createElement("button");
      node.type = "button";
      node.className = "toolbar__button";
      node.textContent = text;
      node.title = label;
      node.setAttribute("aria-label", label);
      node.addEventListener("click", onClick);
      return node;
    };
    this.element.append(this.input, this.count, button("↑", "Previous match", () => this.step(-1)), button("↓", "Next match", () => this.step(1)), button("×", "Close the finder", () => this.close()));
    this.input.addEventListener("input", () => this.search());
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") this.step(event.shiftKey ? -1 : 0);
      else if (event.key === "ArrowDown" || event.key === "ArrowRight") this.step(1);
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") this.step(-1);
      else if (event.key === "Escape") this.close();
      else return;
      event.preventDefault();
      event.stopPropagation();
    });
  }

  /** Whether `event` opens the finder: `/`, or Ctrl/⌘+F, outside a text box. */
  static opens(event: KeyboardEvent): boolean {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "f") return true;
    return !typing && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "/";
  }

  /** The map on screen; a new one searches again. */
  setDiagram(diagram: ViewDiagram | null): void {
    this.diagram = diagram;
    if (!this.element.hidden) this.search();
  }

  open(): void {
    this.element.hidden = false;
    this.input.focus();
    this.input.select();
    this.search();
  }

  close(): void {
    this.element.hidden = true;
    this.matches = [];
    this.host.mark(null, null);
  }

  private search(): void {
    this.matches = this.diagram === null ? [] : matchBoxes(this.diagram, this.input.value);
    this.current = 0;
    this.show();
  }

  /** Moves `delta` matches along, wrapping, and centres on the match. */
  private step(delta: number): void {
    if (this.matches.length === 0) return;
    this.current = (this.current + delta + this.matches.length) % this.matches.length;
    this.show();
    this.host.focus(this.matches[this.current]!);
  }

  private show(): void {
    const empty = this.input.value.trim() === "";
    this.count.textContent = empty ? "" : this.matches.length === 0 ? "No match" : `${this.current + 1} of ${this.matches.length}`;
    this.host.mark(empty ? null : this.matches, this.matches[this.current] ?? null);
  }
}
