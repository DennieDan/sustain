// Node tooltip (FR-VIEW-07, FR-CMP-12): shown after hovering a node for 300 ms, kept while the
// pointer is over the node or the tooltip, hidden 200 ms after leaving both. Source entries post
// `openSource`; with change marks on, a status line and the component's changed files (A/M/R
// post `openFile`).
import type { ElementDiff } from "../core/diagramDiff";
import type { ViewDiagram } from "../core/tolerant";
import type { WebviewMessage } from "./protocol";
import type { FileChange } from "../core/runChanges";
import type { SourceRef } from "../core/types";

export const SHOW_DELAY_MS = 300;
export const HIDE_DELAY_MS = 200;
/** Gap between the node and the tooltip, in pixels. */
const GAP_PX = 6;

/** `path:line–end_line`, `path:line` (no `end_line`, or equal to `line`), or `path` (no `line`). */
export function formatSource(source: SourceRef): string {
  if (source.line === undefined) return source.path;
  if (source.end_line === undefined || source.end_line === source.line) return `${source.path}:${source.line}`;
  return `${source.path}:${source.line}\u2013${source.end_line}`;
}

/** `<status> <path>`, renames as `R <oldPath> → <path>` (FR-CMP-11, FR-CMP-12). */
export function formatFileChange(file: FileChange): string {
  return file.status === "R" && file.oldPath !== undefined ? `R ${file.oldPath} \u2192 ${file.path}` : `${file.status} ${file.path}`;
}

/** What the tooltip shows about changes while the marks are on (FR-CMP-12). */
export interface TooltipChanges {
  /** Aligned with the diagram's components. */
  statuses: readonly ElementDiff[];
  /** Changed files per component ID from `changes.json`; `undefined` when not available. */
  files: ReadonlyMap<string, readonly FileChange[]> | undefined;
}

function div(className: string, text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = className;
  el.textContent = text;
  return el;
}

/**
 * Hover tooltip for the `.node[data-index]` elements under `canvas`, drawn into `element`
 * (an empty, initially `hidden` HTML element). Content:
 * `div.tooltip__label`, optional `div.tooltip__sublabel`, `div.tooltip__type`, with changes set
 * an optional `div.tooltip__status.tooltip__status--<status>`, an optional `div.tooltip__note`
 * with why the box is doubtful (ACC-03), and when the component has sources
 * `ul.tooltip__sources` > `li` > `button.tooltip__source[data-index]` > `span.tooltip__path` +
 * optional `span.tooltip__source-label`, and with changed files `ul.tooltip__files` > `li` >
 * `button.tooltip__file[data-path]` (A/M/R) or `span.tooltip__file` (D).
 */
export class TooltipController {
  private diagram: ViewDiagram | undefined;
  private changes: TooltipChanges | undefined;
  /** Notes shown under a box's type, by source (ACC-03's checks, ARC-03's hotspots), each by box id. */
  private readonly notes = new Map<string, Record<string, string>>();
  /** The node element under the pointer. */
  private hovered: Element | undefined;
  private overTooltip = false;
  /** Component index the tooltip is showing. */
  private shownIndex: number | undefined;
  private showTimer: number | undefined;
  private hideTimer: number | undefined;

  constructor(
    canvas: SVGSVGElement,
    private readonly element: HTMLElement,
    private readonly post: (message: WebviewMessage) => void,
  ) {
    canvas.addEventListener("pointerover", (event) => this.onCanvasOver(event));
    canvas.addEventListener("pointerout", (event) => this.onCanvasOut(event));
    element.addEventListener("pointerenter", () => {
      this.overTooltip = true;
      this.cancelHide();
    });
    element.addEventListener("pointerleave", () => {
      this.overTooltip = false;
      this.scheduleHide();
    });
    element.addEventListener("click", (event) => this.onClick(event));
  }

  /** Sets the diagram whose components the node indices refer to, and hides the tooltip. */
  setDiagram(diagram: ViewDiagram | undefined): void {
    this.diagram = diagram;
    this.hovered = undefined;
    this.hide();
  }

  /** Sets the change lines to show, or `undefined` for none (marks off), and hides the tooltip. */
  setChanges(changes: TooltipChanges | undefined): void {
    this.changes = changes;
    this.hide();
  }

  /** Sets `source`'s notes for boxes, by id. */
  setNotes(source: string, notes: Record<string, string>): void {
    this.notes.set(source, notes);
  }

  /** Hides the tooltip now and cancels pending show and hide delays. */
  hide(): void {
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    this.overTooltip = false;
    this.close();
  }

  /** Hides the tooltip; a pending show for another node stays scheduled. */
  private close(): void {
    this.cancelHide();
    this.shownIndex = undefined;
    this.element.hidden = true;
    this.element.replaceChildren();
    this.element.removeAttribute("data-id");
  }

  private onCanvasOver(event: PointerEvent): void {
    const node = event.target instanceof Element ? event.target.closest(".node[data-index]") : null;
    if (!node || node === this.hovered) return;
    this.hovered = node;
    const index = Number(node.getAttribute("data-index"));
    if (index === this.shownIndex) {
      this.cancelHide();
      return;
    }
    clearTimeout(this.showTimer);
    this.showTimer = window.setTimeout(() => this.show(node, index), SHOW_DELAY_MS);
  }

  private onCanvasOut(event: PointerEvent): void {
    const node = event.target instanceof Element ? event.target.closest(".node[data-index]") : null;
    if (!node || node !== this.hovered) return;
    if (event.relatedTarget instanceof Element && node.contains(event.relatedTarget)) return;
    this.hovered = undefined;
    clearTimeout(this.showTimer);
    this.showTimer = undefined;
    this.scheduleHide();
  }

  private cancelHide(): void {
    clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  /** Starts the hide delay unless the pointer is over the tooltip or the node it shows. */
  private scheduleHide(): void {
    if (this.shownIndex === undefined || this.overTooltip || this.hideTimer !== undefined) return;
    if (this.hovered && Number(this.hovered.getAttribute("data-index")) === this.shownIndex) return;
    this.hideTimer = window.setTimeout(() => this.close(), HIDE_DELAY_MS);
  }

  private show(node: Element, index: number): void {
    this.showTimer = undefined;
    const component = this.diagram?.components[index];
    if (!component) return;
    this.cancelHide();
    this.shownIndex = index;
    const children: HTMLElement[] = [div("tooltip__label", component.label)];
    if (component.sublabel) children.push(div("tooltip__sublabel", component.sublabel));
    children.push(div("tooltip__type", component.type));
    const diff = this.changes?.statuses[index];
    if (diff && (diff.status === "added" || diff.status === "changed" || diff.status === "kept")) {
      const text = diff.status === "added" ? "New" : diff.status === "kept" ? "Kept" : `Changed: ${diff.fields.map((f) => f.field).join(", ")}`;
      children.push(div(`tooltip__status tooltip__status--${diff.status}`, text));
    }
    for (const notes of this.notes.values()) {
      const note = notes[component.id];
      if (note !== undefined) children.push(div("tooltip__note", note));
    }
    if (component.sources.length > 0) {
      const list = document.createElement("ul");
      list.className = "tooltip__sources";
      component.sources.forEach((source, i) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tooltip__source";
        button.setAttribute("data-index", String(i));
        const path = document.createElement("span");
        path.className = "tooltip__path";
        path.textContent = formatSource(source);
        button.append(path);
        if (source.label) {
          const label = document.createElement("span");
          label.className = "tooltip__source-label";
          label.textContent = source.label;
          button.append(label);
        }
        const item = document.createElement("li");
        item.append(button);
        list.append(item);
      });
      children.push(list);
    }
    const files = this.changes?.files?.get(component.id) ?? [];
    if (files.length > 0) {
      const list = document.createElement("ul");
      list.className = "tooltip__files";
      for (const file of files) {
        const entry = document.createElement(file.status === "D" ? "span" : "button");
        entry.className = "tooltip__file";
        if (entry instanceof HTMLButtonElement) {
          entry.type = "button";
          entry.setAttribute("data-path", file.path);
        }
        entry.textContent = formatFileChange(file);
        const item = document.createElement("li");
        item.append(entry);
        list.append(item);
      }
      children.push(list);
    }
    this.element.replaceChildren(...children);
    this.element.setAttribute("data-id", component.id);
    this.element.hidden = false;
    this.place(node);
  }

  /** Below the node, or above it when there is no room below; kept inside the window. */
  private place(node: Element): void {
    const anchor = node.getBoundingClientRect();
    const box = this.element.getBoundingClientRect();
    const below = anchor.bottom + GAP_PX;
    const top = below + box.height <= window.innerHeight ? below : Math.max(0, anchor.top - GAP_PX - box.height);
    const left = Math.max(0, Math.min(anchor.left, window.innerWidth - box.width));
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  private onClick(event: Event): void {
    const target = event.target instanceof Element ? event.target : null;
    const file = target?.closest("button.tooltip__file[data-path]");
    if (file) {
      this.post({ type: "openFile", path: file.getAttribute("data-path")! });
      return;
    }
    const button = target?.closest(".tooltip__source[data-index]");
    const componentId = this.element.getAttribute("data-id");
    if (!button || componentId === null) return;
    this.post({ type: "openSource", componentId, index: Number(button.getAttribute("data-index")) });
  }
}
