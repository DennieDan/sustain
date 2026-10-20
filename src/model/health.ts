// ARC-05: the sidebar's Health section. Two lines from what other features already know: imports
// that break a rule, and the most changed box. Browser-safe.
export type HealthKind = "violations" | "hotspot";

export interface HealthItem {
  kind: HealthKind;
  text: string;
  /** Whether the line asks for a look. */
  attention: boolean;
}

export interface HealthInput {
  /** `null` without rules. */
  violations: number | null;
  hotspot: { label: string; commits: number } | null;
  days: number;
}

const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;

export function healthItems(input: HealthInput): HealthItem[] {
  const { violations, hotspot } = input;
  return [
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
