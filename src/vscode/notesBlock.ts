// ARC-04: architecture notes for coding agents. A managed block in AGENTS.md (and in CLAUDE.md when it
// does not import AGENTS.md) holds the map's boxes with their roles and paths, its arrows, and the
// rules in plain language. Writing again replaces only the block. Browser-safe.
import { PATH_PREFIX, type Rule } from "../core-node/rules";

export const NOTES_START = "<!-- sustain:architecture:start -->";
export const NOTES_END = "<!-- sustain:architecture:end -->";

export interface NotesMap {
  run: string;
  components: readonly { id: string; label: string; sublabel?: string; type: string; sources: readonly { path: string }[] }[];
  connections: readonly { from: string; to: string; label?: string }[];
}

/** The block, markers included, for `map` and `rules`. */
export function notesBlock(map: NotesMap, rules: readonly Rule[]): string {
  const label = new Map(map.components.map((component) => [component.id, component.label]));
  const end = (target: string): string => (target.startsWith(PATH_PREFIX) ? `files matching \`${target.slice(PATH_PREFIX.length)}\`` : (label.get(target) ?? target));
  const ends = (targets: readonly string[] | undefined): string => {
    const names = (targets ?? []).map(end);
    return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  };
  const lines = [
    NOTES_START,
    "## Architecture",
    "",
    `Sustain wrote this block from the map \`.archify/${map.run}\` and replaces it when the notes are written again. Change the map or \`sustain.config.json\`, not this block.`,
    "",
    "### Boxes",
    "",
  ];
  for (const component of map.components) {
    const paths = [...new Set(component.sources.map((source) => source.path))];
    const role = component.sublabel ? `${component.sublabel} (${component.type})` : component.type;
    lines.push(`- **${component.label}**: ${role}.${paths.length > 0 ? ` Code: ${paths.map((path) => `\`${path}\``).join(", ")}.` : ""}`);
  }
  if (map.connections.length > 0) {
    lines.push("", "### How the boxes work together", "");
    for (const arrow of map.connections) lines.push(`- ${end(arrow.from)} uses ${end(arrow.to)}${arrow.label ? ` (${arrow.label})` : ""}.`);
  }
  if (rules.length > 0) {
    lines.push("", "### Rules", "", "Keep to these when you change the code. `sustain check` and the editor report imports that break them.", "");
    for (const rule of rules) {
      const sentence =
        rule.kind === "forbid"
          ? `Code in ${ends(rule.from)} must not import ${ends(rule.to)}.`
          : rule.kind === "only-via"
            ? `Code reaches ${ends(rule.to)} only through ${ends(rule.via)}.`
            : rule.to && rule.to.length > 0
              ? `Only ${ends(rule.to)} may import ${ends(rule.from)}.`
              : `Nothing outside ${ends(rule.from)} may import it.`;
      lines.push(`- ${sentence} ${rule.reason.trim()}`);
    }
  }
  lines.push(NOTES_END);
  return lines.join("\n");
}

/** `text` with its block replaced by `block`, or `block` added at the end. Text outside the markers stays as it is. */
export function mergeNotes(text: string, block: string): string {
  const start = text.indexOf(NOTES_START);
  const end = start < 0 ? -1 : text.indexOf(NOTES_END, start);
  if (start >= 0 && end >= 0) return text.slice(0, start) + block + text.slice(end + NOTES_END.length);
  if (text.trim() === "") return `${block}\n`;
  return `${text.replace(/\n*$/, "")}\n\n${block}\n`;
}

/** SAF-08: `text` without its block and the blank lines that set it apart; text outside the markers stays as it is. */
export function removeNotes(text: string): string {
  const start = text.indexOf(NOTES_START);
  const end = start < 0 ? -1 : text.indexOf(NOTES_END, start);
  if (start < 0 || end < 0) return text;
  const before = text.slice(0, start).replace(/\n*$/, "");
  const after = text.slice(end + NOTES_END.length).replace(/^\n*/, "");
  if (before === "") return after;
  return after === "" ? `${before}\n` : `${before}\n\n${after}`;
}

/** Whether a CLAUDE.md needs the block itself: it does not import AGENTS.md. */
export function claudeNeedsNotes(text: string): boolean {
  return !/^\s*@(\.\/)?AGENTS\.md\s*$/m.test(text);
}
