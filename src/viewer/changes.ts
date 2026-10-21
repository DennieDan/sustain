// Change view of the webview (FR-CMP-09, FR-CMP-11, FR-CMP-12): the comparison of the open
// diagram with its baseline, the header strip above the canvas and the changes panel docked
// right. Repository text (labels, paths, commit subjects, run folders) goes in with
// `textContent` only (§5.4).
import { diffDiagrams, markKept } from "../core/diagramDiff";
import type { DiagramDiff, ElementDiff, FieldChange } from "../core/diagramDiff";
import type { CommitRef } from "../core/comparison";
import { relativeAge } from "../core/dates";
import type { Compare, WebviewMessage } from "./protocol";
import { readDiagram } from "../core/tolerant";
import type { ViewConnection, ViewDiagram } from "../core/tolerant";
import { button, el } from "./dom";
import type { ElementKind } from "./render";
import { formatFileChange } from "./tooltip";

/** The open diagram's comparison: what the host sent, the parsed baseline and the diff. */
export interface Comparison {
  compare: Compare;
  baseline: ViewDiagram;
  /** Kept components marked when `compare.changes` is present. */
  diff: DiagramDiff;
}

/** Per-panel view state kept through `vscode.setState` (FR-CMP-12). */
export interface ChangesState {
  /** The Changes toggle: marks, tooltip change lines and the panel. */
  marks: boolean;
  /** The panel shows its header only. */
  collapsed: boolean;
}

export const DEFAULT_CHANGES_STATE: ChangesState = { marks: true, collapsed: false };

export const KEPT_NOTE = "Code changed, kept and Not in any component are available only when comparing with the previous run.";
export const NO_DIFF_TEXT = "No diagram changes since the baseline";
const UNNAMED_BOUNDARY = "(unnamed boundary)";

/** The persisted state from `vscode.getState()`, with defaults for anything missing or malformed. */
export function readChangesState(value: unknown): ChangesState {
  const state = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    marks: typeof state["marks"] === "boolean" ? state["marks"] : DEFAULT_CHANGES_STATE.marks,
    collapsed: typeof state["collapsed"] === "boolean" ? state["collapsed"] : DEFAULT_CHANGES_STATE.collapsed,
  };
}

/**
 * Diffs `current` against the baseline in `compare` (FR-CMP-03), marking kept components from
 * `compare.changes` (FR-CMP-04). `null` without a comparison or when the baseline is unreadable.
 */
export function compareDiagrams(current: ViewDiagram, compare: Compare | null): Comparison | null {
  if (!compare) return null;
  const baseline = readDiagram(compare.baselineDoc);
  if (!baseline.ok) return null;
  let diff = diffDiagrams(baseline.diagram, current);
  if (compare.changes) diff = markKept(diff, current, new Set(compare.changes.touchedComponents.map((c) => c.id)));
  return { compare, baseline: baseline.diagram, diff };
}

/** Older commit dates show as the ISO date. */
const RELATIVE_DAYS = 30;

/** `<short hash> "<subject>"` and, when `withDate`, ` · <relative date>` (full ISO as `title`). */
function commitParts(commit: CommitRef | null, withDate: boolean, now: Date): Node[] {
  if (!commit) return [document.createTextNode("unknown revision")];
  const parts: Node[] = [el("code", "header__hash", commit.revision.slice(0, 7))];
  if (commit.subject) parts.push(document.createTextNode(" "), el("span", "header__subject", `\u201c${commit.subject}\u201d`));
  const date = withDate && commit.committedAt ? relativeAge(commit.committedAt, now, RELATIVE_DAYS) : undefined;
  if (date !== undefined) {
    const span = el("span", "header__date", date);
    span.title = commit.committedAt!;
    parts.push(document.createTextNode(" \u00b7 "), span);
  }
  return parts;
}

const STATUS_NAMES: [className: string, name: string][] = [
  ["added", "Added"],
  ["changed", "Changed"],
  ["kept", "Kept"],
  ["removed", "Removed"],
];

/** A row of the Added, Changed or Kept section; clickable when `focus` is given. */
interface Row {
  kind: ElementKind;
  /** Index into the open diagram's array of `kind`; absent for removed rows. */
  index?: number;
  name: string;
  /** Changed fields or the kept file count. */
  detail?: string;
}

/** Changed fields: text fields as `field: “old” → “new”` (`(none)` when absent), set fields by name. */
export function formatFields(fields: readonly FieldChange[]): string {
  return fields
    .map((f) => ("before" in f ? `${f.field}: ${[f.before, f.after].map((v) => (v === null ? "(none)" : `\u201c${v}\u201d`)).join(" \u2192 ")}` : f.field))
    .join("; ");
}

/** `<from label> → <to label>`, plus ` (<label>)` when present; unknown IDs show as themselves. */
export function connectionName(connection: ViewConnection, diagram: ViewDiagram): string {
  const labels = new Map(diagram.components.map((c) => [c.id, c.label]));
  const name = `${labels.get(connection.from) ?? connection.from} \u2192 ${labels.get(connection.to) ?? connection.to}`;
  return connection.label ? `${name} (${connection.label})` : name;
}

export interface ChangesHooks {
  post(message: WebviewMessage): void;
  /** Fits the viewport to an element of the open diagram. */
  focus(kind: ElementKind, index: number): void;
  /** After the Changes toggle or the collapse control changed `state`. */
  stateChanged(state: ChangesState): void;
}

/**
 * Owns the header strip (`header`) and the changes panel (`panel`), both empty elements.
 *
 * Header: `div.header__strip` with `span.header__commits`, optional `span.header__dirty`,
 * `span.header__run`, `span.header__counts`, optional `span.header__approximate`,
 * `button.header__compare` and `button.header__toggle[aria-pressed]`; then
 * `div.header__warning[data-code]` per warning (the `reversed` one with `button.header__swap`).
 * Without a comparison: `span.header__none` "No comparison" and the compare button.
 *
 * Panel: `div.changes__head` (title, `ul.changes__legend`, `button.changes__collapse`) and
 * `div.changes__body` with optional `p.changes__empty`, `section.changes__section[data-section]`
 * per non-empty section (`h3` title with `span.changes__count`, `ul` of `li.changes__row`
 * holding a `button.changes__item` or `span.changes__item`), and optional `p.changes__note`.
 */
export class ChangesView {
  private comparison: Comparison | null = null;

  constructor(
    private readonly header: HTMLElement,
    private readonly panel: HTMLElement,
    private readonly hooks: ChangesHooks,
    public state: ChangesState,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Redraws the header and the panel for `diagram`, the open diagram, and its comparison. */
  show(diagram: ViewDiagram, comparison: Comparison | null): void {
    this.comparison = comparison;
    this.renderHeader();
    this.renderPanel(diagram);
  }

  /** Empties the header and the panel (nothing on screen). */
  clear(): void {
    this.comparison = null;
    this.header.replaceChildren();
    this.panel.replaceChildren();
    this.syncState();
  }

  private setState(state: ChangesState): void {
    this.state = state;
    this.syncState();
    this.hooks.stateChanged(state);
  }

  /** Applies `state` to the toggle and the panel's visibility and collapse. */
  private syncState(): void {
    const toggle = this.header.querySelector(".header__toggle");
    toggle?.setAttribute("aria-pressed", String(this.state.marks));
    this.panel.hidden = !this.comparison || !this.state.marks;
    this.panel.classList.toggle("changes--collapsed", this.state.collapsed);
    const body = this.panel.querySelector<HTMLElement>(".changes__body");
    if (body) body.hidden = this.state.collapsed;
    const collapse = this.panel.querySelector(".changes__collapse");
    collapse?.setAttribute("aria-expanded", String(!this.state.collapsed));
    collapse?.setAttribute("title", this.state.collapsed ? "Expand" : "Collapse");
    if (collapse) collapse.textContent = this.state.collapsed ? "\u25b8" : "\u25be";
  }

  private renderHeader(): void {
    const strip = el("div", "header__strip");
    const compareButton = button("header__button header__compare", "Compare with\u2026", () => this.hooks.post({ type: "compareWith" }));
    const comparison = this.comparison;
    if (!comparison) {
      strip.append(el("span", "header__none", "No comparison"), compareButton);
      this.header.replaceChildren(strip);
      this.syncState();
      return;
    }
    const { context } = comparison.compare;
    const { counts } = comparison.diff;
    const now = this.now();
    const commits = el("span", "header__commits");
    commits.append("Compared with ", ...commitParts(context.baselineCommit, true, now), " \u2192 ", ...commitParts(context.currentCommit, false, now));
    strip.append(commits);
    const dirty = context.baselineCommit?.dirtyCount ?? 0;
    if (dirty > 0) strip.append(el("span", "header__dirty", `+ ${dirty} uncommitted file${dirty === 1 ? "" : "s"}`));
    strip.append(el("span", "header__run", context.baselineRun));
    const countsSpan = el("span", "header__counts");
    countsSpan.append(
      el("span", "header__count header__count--added", `+${counts.added}`),
      " ",
      el("span", "header__count header__count--removed", `\u2212${counts.removed}`),
      " ",
      el("span", "header__count header__count--changed", `~${counts.changed}`),
    );
    strip.append(countsSpan);
    if (context.approximate) strip.append(el("span", "header__approximate", "approximate"));
    const toggle = button("header__button header__toggle", "Changes", () => this.setState({ ...this.state, marks: !this.state.marks }));
    toggle.title = "Show changes on the diagram";
    strip.append(compareButton, toggle);
    const lines: HTMLElement[] = [strip];
    for (const warning of context.warnings) {
      const line = el("div", "header__warning", warning.message);
      line.setAttribute("data-code", warning.code);
      if (warning.code === "reversed") line.append(" ", button("header__button header__swap", "Swap", () => this.hooks.post({ type: "swap" })));
      lines.push(line);
    }
    this.header.replaceChildren(...lines);
    this.syncState();
  }

  private renderPanel(diagram: ViewDiagram): void {
    const comparison = this.comparison;
    if (!comparison) {
      this.panel.replaceChildren();
      this.syncState();
      return;
    }
    const head = el("div", "changes__head");
    const legend = el("ul", "changes__legend");
    for (const [className, name] of STATUS_NAMES) {
      const item = el("li", `changes__legend-item changes__legend-item--${className}`);
      item.append(el("span", "changes__swatch"), name);
      legend.append(item);
    }
    const collapse = button("changes__collapse", "", () => this.setState({ ...this.state, collapsed: !this.state.collapsed }));
    head.append(el("span", "changes__title", "Changes"), legend, collapse);

    const body = el("div", "changes__body");
    const { diff, baseline, compare } = comparison;
    const { counts } = diff;
    if (counts.added + counts.removed + counts.changed === 0) body.append(el("p", "changes__empty", NO_DIFF_TEXT));

    const byStatus = (wanted: (d: ElementDiff) => boolean): Row[] => [
      ...diff.components.flatMap((d, index): Row[] =>
        wanted(d) ? [{ kind: "component", index, name: diagram.components[index]!.label, detail: formatFields(d.fields) }] : [],
      ),
      ...diff.connections.flatMap((d, index): Row[] =>
        wanted(d) ? [{ kind: "connection", index, name: connectionName(diagram.connections[index]!, diagram), detail: formatFields(d.fields) }] : [],
      ),
      ...diff.boundaries.flatMap((d, index): Row[] =>
        wanted(d) ? [{ kind: "boundary", index, name: diagram.boundaries[index]!.label || UNNAMED_BOUNDARY, detail: formatFields(d.fields) }] : [],
      ),
    ];
    const added = byStatus((d) => d.status === "added");
    const removed: Row[] = [
      ...diff.removed.components.map((c): Row => ({ kind: "component", name: c.label })),
      ...diff.removed.connections.map((c): Row => ({ kind: "connection", name: connectionName(c, baseline) })),
      ...diff.removed.boundaries.map((b): Row => ({ kind: "boundary", name: b.label || UNNAMED_BOUNDARY })),
    ];
    const changed = byStatus((d) => d.status === "changed" || d.status === "renamed");
    this.appendSection(body, "added", "Added", added);
    const removedSection = this.appendSection(body, "removed", "Removed", removed);
    removedSection?.append(button("changes__open-baseline", "Open baseline", () => this.hooks.post({ type: "openBaseline" })));
    this.appendSection(body, "changed", "Changed", changed);

    if (compare.context.keptAvailable && compare.changes) {
      const files = new Map(compare.changes.touchedComponents.map((c) => [c.id, c.files.length]));
      const kept = diff.components.flatMap((d, index): Row[] => {
        if (d.status !== "kept") return [];
        const component = diagram.components[index]!;
        const n = files.get(component.id) ?? 0;
        return [{ kind: "component", index, name: component.label, detail: `${n} changed file${n === 1 ? "" : "s"}` }];
      });
      this.appendSection(body, "kept", "Code changed, kept", kept);
      const uncited = compare.changes.uncited;
      if (uncited.length > 0) {
        const list = el("ul", "changes__list");
        for (const file of uncited) {
          const item = el("li", "changes__row");
          if (file.status === "D") item.append(el("span", "changes__item changes__file", formatFileChange(file)));
          else {
            const entry = button("changes__item changes__file", formatFileChange(file), () => this.hooks.post({ type: "openFile", path: file.path }));
            entry.setAttribute("data-path", file.path);
            item.append(entry);
          }
          list.append(item);
        }
        body.append(this.section("uncited", "Not in any component", uncited.length, list));
      }
    } else if (compare.context.keptNote) {
      body.append(el("p", "changes__note", KEPT_NOTE));
    }

    this.panel.replaceChildren(head, body);
    this.syncState();
  }

  private section(key: string, title: string, count: number, list: HTMLElement): HTMLElement {
    const section = el("section", "changes__section");
    section.setAttribute("data-section", key);
    const heading = el("h3", "changes__heading", `${title} `);
    heading.append(el("span", "changes__count", String(count)));
    section.append(heading, list);
    return section;
  }

  /** Appends a section of `rows` unless it is empty; rows with an `index` are clickable. */
  private appendSection(body: HTMLElement, key: string, title: string, rows: Row[]): HTMLElement | undefined {
    if (rows.length === 0) return undefined;
    const list = el("ul", "changes__list");
    for (const row of rows) {
      const index = row.index;
      const item = el("li", "changes__row");
      const entry = index === undefined ? el("span", "changes__item") : button("changes__item", "", () => this.hooks.focus(row.kind, index));
      entry.setAttribute("data-kind", row.kind);
      if (index !== undefined) entry.setAttribute("data-index", String(index));
      entry.append(el("span", "changes__kind", row.kind), " ", el("span", "changes__name", row.name));
      if (row.detail) entry.append(" ", el("span", "changes__fields", row.detail));
      item.append(entry);
      list.append(item);
    }
    const section = this.section(key, title, rows.length, list);
    body.append(section);
    return section;
  }
}
