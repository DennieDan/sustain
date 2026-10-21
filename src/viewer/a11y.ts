// VWR-04: the map for the keyboard and for screen readers. Each box's accessible name says what it
// is and which code it opens.
import type { ViewComponent } from "../core/tolerant";

function cite(source: ViewComponent["sources"][number]): string {
  return `${source.path}${source.line === undefined ? "" : `:${source.line}${source.end_line === undefined ? "" : `-${source.end_line}`}`}`;
}

/** A box's accessible name: its label and sublabel, then the code it opens when it cites any. */
export function boxName(component: ViewComponent): string {
  const what = component.sublabel ? `${component.label}, ${component.sublabel}` : component.label;
  const first = component.sources[0];
  return first === undefined ? what : `${what}. Opens ${cite(first)}`;
}
