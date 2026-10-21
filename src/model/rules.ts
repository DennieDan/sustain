// ARC-01: architecture rules from `sustain.config.json`, checked against ACC-02's imports at zero
// tokens. A rule's ends are main-map box ids or `path:` globs. `forbid` refuses imports from `from` to
// `to`; `only-via` lets imports reach `to` only from `via` (and from `to` itself); `isolated` lets
// nothing import `from` except what `to` lists. Browser-safe.
import type { ImportRef } from "./evidence/paths";
import { Ownership } from "./ownership";
import { globToRegExp } from "./glob";
import { isRecord } from "../core/types";

export const RULE_KINDS = ["forbid", "only-via", "isolated"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];
/** The prefix that makes a rule end a glob instead of a box id. */
export const PATH_PREFIX = "path:";

export interface Rule {
  id: string;
  kind: RuleKind;
  from: string[];
  to?: string[];
  via?: string[];
  reason: string;
}

export interface Violation {
  rule: string;
  kind: RuleKind;
  reason: string;
  /** The importing file and the line of its import. */
  file: string;
  line: number;
  imported: string;
}

const ends = (value: unknown): string[] | null => (typeof value === "string" && value !== "" ? [value] : Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string" && entry !== "") ? (value as string[]) : null);

/** The rules in `value` (a config's `rules`), and what is wrong with any that are not. */
export function readRules(value: unknown): { rules: Rule[]; errors: string[] } {
  const rules: Rule[] = [];
  const errors: string[] = [];
  if (!Array.isArray(value)) return { rules, errors: ['"rules" must be a list'] };
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const at = `rules[${index}]`;
    if (!isRecord(entry)) return void errors.push(`${at} must be an object`);
    const unknown = Object.keys(entry).filter((key) => !["id", "kind", "from", "to", "via", "reason"].includes(key));
    for (const key of unknown) errors.push(`${at} has unknown key "${key}"`);
    const id = entry["id"];
    const kind = entry["kind"];
    if (typeof id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(id)) errors.push(`${at}.id must be letters, digits, ".", "_" or "-"`);
    else if (ids.has(id)) errors.push(`${at}.id "${id}" is used twice`);
    if (typeof id === "string") ids.add(id);
    if (!RULE_KINDS.includes(kind as RuleKind)) errors.push(`${at}.kind must be ${RULE_KINDS.join(", ")}`);
    const from = ends(entry["from"]);
    const to = entry["to"] === undefined ? undefined : ends(entry["to"]);
    const via = entry["via"] === undefined ? undefined : ends(entry["via"]);
    if (from === null) errors.push(`${at}.from must be a box id, a "path:" glob, or a list of them`);
    if (to === null) errors.push(`${at}.to must be a box id, a "path:" glob, or a list of them`);
    if (via === null) errors.push(`${at}.via must be a box id, a "path:" glob, or a list of them`);
    if ((kind === "forbid" || kind === "only-via") && to === undefined) errors.push(`${at} needs "to"`);
    if (kind === "only-via" && via === undefined) errors.push(`${at} needs "via"`);
    if (typeof entry["reason"] !== "string" || entry["reason"].trim() === "") errors.push(`${at}.reason must say why the rule exists`);
    if (unknown.length === 0 && typeof id === "string" && RULE_KINDS.includes(kind as RuleKind) && from && to !== null && via !== null && typeof entry["reason"] === "string" && entry["reason"].trim() !== "") {
      if ((kind === "forbid" || kind === "only-via") && to === undefined) return;
      if (kind === "only-via" && via === undefined) return;
      rules.push({ id, kind: kind as RuleKind, from, ...(to ? { to } : {}), ...(via ? { via } : {}), reason: entry["reason"] });
    }
  });
  return { rules, errors };
}

/** Whether a file belongs to any of `targets`: a box that owns it (PRC-01), or a matching glob. */
function matcher(targets: readonly string[] | undefined, ownership: Ownership): (file: string) => boolean {
  const boxes = new Set((targets ?? []).filter((target) => !target.startsWith(PATH_PREFIX)));
  const globs = (targets ?? []).filter((target) => target.startsWith(PATH_PREFIX)).map((target) => globToRegExp(target.slice(PATH_PREFIX.length)));
  return (file) => globs.some((glob) => glob.test(file)) || (boxes.size > 0 && ownership.owners(file).some((owner) => boxes.has(owner)));
}

/** Every import that breaks a rule, in rule order, then by file and line. */
export function checkRules(rules: readonly Rule[], components: readonly { id: string; sources?: readonly { path: string }[] }[], refs: ReadonlyMap<string, readonly ImportRef[]>): Violation[] {
  const ownership = new Ownership(components);
  const violations: Violation[] = [];
  for (const rule of rules) {
    const from = matcher(rule.from, ownership);
    const to = matcher(rule.to, ownership);
    const via = matcher(rule.via, ownership);
    const breaks = (file: string, imported: string): boolean => {
      if (rule.kind === "forbid") return from(file) && to(imported);
      if (rule.kind === "only-via") return to(imported) && !to(file) && !via(file);
      return from(imported) && !from(file) && !to(file);
    };
    const found: Violation[] = [];
    for (const [file, imports] of refs) {
      for (const ref of imports) if (ref.path !== file && breaks(file, ref.path)) found.push({ rule: rule.id, kind: rule.kind, reason: rule.reason, file, line: ref.line, imported: ref.path });
    }
    violations.push(...found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line));
  }
  return violations;
}
