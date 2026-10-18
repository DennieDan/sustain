// ARC-05: the sidebar's Health section. Four lines from what other features already know: the map's
// freshness, changed lines since the map that no box covers, imports that break a rule, and the most
// changed box. Browser-safe.
import { isSourceFile, isTestFile } from "./delta";
import type { ChangeStat } from "./git";
import { Ownership } from "./ownership";

export type HealthKind = "freshness" | "uncovered" | "violations" | "hotspot";

export interface HealthItem {
  kind: HealthKind;
  text: string;
  /** Whether the line asks for a look. */
  attention: boolean;
}

export interface HealthInput {
  /** Changed boxes and all boxes of the main map; `null` when the map has no fingerprints. */
  freshness: { changed: number; total: number } | null;
  uncovered: { lines: number; files: number } | null;
  /** `null` without rules. */
  violations: number | null;
  hotspot: { label: string; commits: number } | null;
  days: number;
}

/** Added lines since the map in source files no box owns, tests left out. */
export function uncoveredLines(
  changes: readonly ChangeStat[],
  untracked: readonly { path: string; lines: number }[],
  components: readonly { id: string; sources?: readonly { path: string }[] }[],
): { lines: number; files: number } {
  const ownership = new Ownership(components);
  const counted = [...changes.map((change) => ({ path: change.path, lines: change.added ?? 0 })), ...untracked].filter(
    (change) => change.lines > 0 && isSourceFile(change.path) && !isTestFile(change.path) && ownership.owners(change.path).length === 0,
  );
  return { lines: counted.reduce((sum, change) => sum + change.lines, 0), files: counted.length };
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

export function healthItems(input: HealthInput): HealthItem[] {
  const { freshness, uncovered, violations, hotspot } = input;
  return [
    freshness === null
      ? { kind: "freshness", text: "The map's freshness is unknown, because it has no fingerprints.", attention: false }
      : freshness.changed === 0
        ? { kind: "freshness", text: "Every box matches its code.", attention: false }
        : { kind: "freshness", text: `${freshness.changed} of ${plural(freshness.total, "box", "boxes")} changed since the map.`, attention: true },
    uncovered === null
      ? { kind: "uncovered", text: "Changes since the map cannot be measured without git.", attention: false }
      : uncovered.lines === 0
        ? { kind: "uncovered", text: "Every changed line since the map is in a box.", attention: false }
        : { kind: "uncovered", text: `${plural(uncovered.lines, "changed line")} in ${plural(uncovered.files, "file")} are in no box.`, attention: true },
    violations === null
      ? { kind: "violations", text: "No architecture rules yet.", attention: false }
      : violations === 0
        ? { kind: "violations", text: "No import breaks a rule.", attention: false }
        : { kind: "violations", text: `${plural(violations, "import")} ${violations === 1 ? "breaks" : "break"} a rule.`, attention: true },
    hotspot === null
      ? { kind: "hotspot", text: `No box's code changed in the last ${input.days} days.`, attention: false }
      : { kind: "hotspot", text: `${hotspot.label} changed most, with ${plural(hotspot.commits, "commit")} in the last ${input.days} days.`, attention: false },
  ];
}
