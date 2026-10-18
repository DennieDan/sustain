// PRC-01 and PRC-04: the delta report as markdown, for `--format markdown` and the pull request
// comment, and its Mermaid flowchart. Labels come from the map, so every one is escaped.
// Browser-safe.
import type { Candidate, DeltaReport } from "./delta";

/** The marker that identifies Sustain's pull request comment. */
export const COMMENT_MARKER = "<!-- sustain-check -->";

/** Text safe in markdown: HTML characters as entities, markdown characters escaped. */
export function escapeMarkdown(text: string): string {
  // Markdown characters first, so the entities' own `#` and `;` stay as they are.
  return text
    .replace(/([\\`*_{}[\]()#+!~-])/g, "\\$1")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "&#124;")
    .replace(/\r?\n/g, " ");
}

/** A path as inline code, or escaped text when it holds a backtick. */
function path(text: string): string {
  return text.includes("`") || /[\r\n]/.test(text) ? escapeMarkdown(text) : `\`${text}\``;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** The one-line summary. */
export function deltaSummary(report: DeltaReport): string {
  const touched = report.touched.strong.length + report.touched.weak.length;
  return [
    `${plural(touched, "box", "boxes")} touched`,
    plural(report.candidates.length, "new box candidate"),
    plural(report.stale.length, "stale box", "stale boxes"),
    plural(report.gone.length, "gone box", "gone boxes"),
    `${plural(report.uncovered.length, "file")} not on the map`,
  ].join(" · ");
}

function candidateLine(candidate: Candidate): string {
  return `- ${path(`${candidate.dir}/`)}: ${plural(candidate.files.length, "file")}, ${plural(candidate.lines, "line")}. Suggested box: ${escapeMarkdown(candidate.label)}`;
}

export interface MarkdownMeta {
  map: string;
  mergeBase: string;
  result: "pass" | "fail";
  reasons: string[];
}

/** Markdown of the report; each list shows at most `maxItems`, then how many more there are. */
export function deltaMarkdown(report: DeltaReport, meta: MarkdownMeta, maxItems = Number.POSITIVE_INFINITY): string {
  const lines = [`### Sustain check: ${meta.result}`, "", `**${deltaSummary(report)}**`, "", `Map ${path(meta.map)}, compared from ${path(meta.mergeBase.slice(0, 7))}.`];
  const section = (title: string, items: string[]): void => {
    if (items.length === 0) return;
    const more = items.length > maxItems ? [`- and ${items.length - maxItems} more`] : [];
    lines.push("", `**${title}**`, "", ...items.slice(0, maxItems), ...more);
  };
  section("Touched boxes", [
    ...report.touched.strong.map((box) => `- ${escapeMarkdown(box.label)}: cited lines changed`),
    ...report.touched.weak.map((box) => `- ${escapeMarkdown(box.label)}: other lines in its files changed`),
  ]);
  section("New box candidates", report.candidates.map(candidateLine));
  section(
    "Stale boxes",
    report.stale.map((box) => `- ${escapeMarkdown(box.label)}: ${box.state === "missing" ? "a cited file is gone" : "its cited code changed since the map"}`),
  );
  section("Gone boxes", report.gone.map((box) => `- ${escapeMarkdown(box.label)}: every cited file is gone`));
  section(`Not on the map (${plural(report.uncovered.length, "file")})`, report.uncovered.map((file) => `- ${path(file)}`));
  if (meta.reasons.length > 0) lines.push("", `Failed on: ${meta.reasons.map(escapeMarkdown).join("; ")}.`);
  return `${lines.join("\n")}\n`;
}

/** A Mermaid label: quotes and angle brackets as entity codes, on one line. */
function mermaidLabel(text: string): string {
  return text.replace(/"/g, "#quot;").replace(/</g, "#lt;").replace(/>/g, "#gt;").replace(/[\r\n]+/g, " ");
}

/**
 * The touched boxes and their neighbours as a Mermaid flowchart, with candidates as dashed nodes.
 * Node ids are generated, so no map id reaches the chart.
 */
export function deltaMermaid(
  report: DeltaReport,
  diagram: { components: readonly { id: string; label: string }[]; connections: readonly { from: string; to: string }[] },
): string | null {
  const touched = new Set([...report.touched.strong, ...report.touched.weak].map((box) => box.id));
  if (touched.size === 0 && report.candidates.length === 0) return null;
  const shown = new Set(touched);
  for (const connection of diagram.connections) {
    if (touched.has(connection.from)) shown.add(connection.to);
    if (touched.has(connection.to)) shown.add(connection.from);
  }
  const ids = new Map<string, string>();
  const lines = ["```mermaid", "flowchart LR"];
  for (const component of diagram.components) {
    if (!shown.has(component.id)) continue;
    const node = `n${ids.size}`;
    ids.set(component.id, node);
    const strong = report.touched.strong.some((box) => box.id === component.id);
    lines.push(`  ${node}["${mermaidLabel(component.label)}"]${strong ? ":::strong" : touched.has(component.id) ? ":::weak" : ""}`);
  }
  for (const connection of diagram.connections) {
    const from = ids.get(connection.from);
    const to = ids.get(connection.to);
    if (from && to) lines.push(`  ${from} --> ${to}`);
  }
  report.candidates.forEach((candidate, index) => lines.push(`  c${index}["${mermaidLabel(`${candidate.label} (new)`)}"]:::candidate`));
  lines.push("  classDef strong stroke-width:3px", "  classDef weak stroke-dasharray:3 3", "  classDef candidate stroke-dasharray:6 4,fill:none", "```");
  return lines.join("\n");
}
