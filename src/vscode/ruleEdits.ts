// ARC-02: rules written from the map. Each builder returns a rule for one menu action; `withRules`
// adds rules to a config with unique ids; `suggestRules` proposes `forbid` both ways for every
// pair of boxes whose code shares no import today. Browser-safe.
import type { SustainConfig } from "../core-node/config";
import { Ownership } from "../core-node/ownership";
import { PATH_PREFIX, readRules, type Rule } from "../core-node/rules";

/** The reason a suggested rule carries until someone writes a better one. */
export const SUGGESTED_REASON = "No import joins these boxes today. Suggested from the map.";

/** "Forbid this dependency": no import from `from`'s files to `to`'s. */
export function forbidRule(from: string, to: string, reason: string): Rule {
  return { id: `forbid-${from}-${to}`, kind: "forbid", from: [from], to: [to], reason };
}

/** "Only allow imports from…": nothing imports `box` except `allowed`. */
export function onlyFromRule(box: string, allowed: readonly string[], reason: string): Rule {
  return { id: `only-${box}-from-${allowed.join("-")}`, kind: "isolated", from: [box], to: [...allowed], reason };
}

/** "Route dependencies through…": imports reach `box` only from `via` (and from itself). */
export function throughRule(box: string, via: string, reason: string): Rule {
  return { id: `${box}-through-${via}`, kind: "only-via", from: [`${PATH_PREFIX}**`], to: [box], via: [via], reason };
}

/** `config` with `rules` added after its own, each id made unique with a numeric suffix. */
export function withRules(config: SustainConfig, rules: readonly Rule[]): SustainConfig {
  const existing = Array.isArray(config.rules) ? config.rules : [];
  const ids = new Set(readRules(existing).rules.map((rule) => rule.id));
  const added = rules.map((rule) => {
    let id = rule.id.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
    for (let n = 2; ids.has(id); n++) id = `${rule.id.slice(0, 76)}-${n}`;
    ids.add(id);
    return { ...rule, id };
  });
  return { ...config, rules: [...existing, ...added] };
}

/**
 * `forbid` both ways for every pair of boxes that both own checked code and share no import link,
 * leaving out pairs an existing `forbid` already covers.
 */
export function suggestRules(components: readonly { id: string; sources?: readonly { path: string }[] }[], links: ReadonlyMap<string, readonly string[]>, existing: readonly Rule[]): Rule[] {
  const ownership = new Ownership(components);
  const withCode = new Set<string>();
  const linked = new Set<string>();
  for (const [file, targets] of links) {
    const owners = ownership.owners(file);
    for (const owner of owners) withCode.add(owner);
    for (const target of targets) for (const from of owners) for (const to of ownership.owners(target)) if (from !== to) linked.add(`${from}\0${to}`);
  }
  const covered = new Set(existing.filter((rule) => rule.kind === "forbid").flatMap((rule) => rule.from.flatMap((from) => (rule.to ?? []).map((to) => `${from}\0${to}`))));
  const boxes = components.map((component) => component.id).filter((id) => withCode.has(id));
  const rules: Rule[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i]!, boxes[j]!];
      if (linked.has(`${a}\0${b}`) || linked.has(`${b}\0${a}`)) continue;
      for (const [from, to] of [[a, b], [b, a]] as const) if (!covered.has(`${from}\0${to}`)) rules.push(forbidRule(from, to, SUGGESTED_REASON));
    }
  }
  return rules;
}
