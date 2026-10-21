// ARC-02: the rules each map action writes, unique ids when added to a config, and suggestions for
// box pairs whose code shares no import.
import { expect, test } from "vitest";
import { forbidRule, onlyFromRule, suggestRules, SUGGESTED_REASON, throughRule, withRules } from "../../../src/model/ruleEdits";
import { readRules } from "../../../src/core-node/rules";

test("ARC-02 each map action writes its kind of rule, and each passes the config check", () => {
  const rules = [forbidRule("api", "store", "Through the repository."), onlyFromRule("store", ["api", "jobs"], "Only these."), throughRule("store", "repo", "One door.")];
  expect(rules).toEqual([
    { id: "forbid-api-store", kind: "forbid", from: ["api"], to: ["store"], reason: "Through the repository." },
    { id: "only-store-from-api-jobs", kind: "isolated", from: ["store"], to: ["api", "jobs"], reason: "Only these." },
    { id: "store-through-repo", kind: "only-via", from: ["path:**"], to: ["store"], via: ["repo"], reason: "One door." },
  ]);
  expect(readRules(rules).errors).toEqual([]);
});

test("ARC-02 added rules keep the config's own and get unique ids", () => {
  const config = { map: "architecture-x-20261019-000000", rules: [forbidRule("api", "store", "x")] };
  const next = withRules(config, [forbidRule("api", "store", "y"), forbidRule("api", "store", "z")]);
  expect(next.map).toBe(config.map);
  expect((next.rules as { id: string }[]).map((rule) => rule.id)).toEqual(["forbid-api-store", "forbid-api-store-2", "forbid-api-store-3"]);
  expect(withRules({}, [forbidRule("a b", "c", "x")]).rules).toEqual([{ ...forbidRule("a b", "c", "x"), id: "forbid-a-b-c" }]);
});

test("ARC-02 suggestions forbid both ways between boxes with code and no import link, leaving out covered pairs", () => {
  const components = [
    { id: "ui", sources: [{ path: "src/ui/a.ts" }] },
    { id: "api", sources: [{ path: "src/api/b.ts" }] },
    { id: "store", sources: [{ path: "src/store/c.ts" }] },
    { id: "jobs", sources: [{ path: "src/jobs/d.ts" }] },
    { id: "docs", sources: [{ path: "README.md" }] },
  ];
  const links = new Map([
    ["src/ui/a.ts", ["src/api/b.ts"]],
    ["src/api/b.ts", ["src/store/c.ts"]],
    ["src/store/c.ts", []],
    ["src/jobs/d.ts", ["src/ui/a.ts"]],
  ]);
  const suggested = suggestRules(components, links, [forbidRule("ui", "jobs", "x")]);
  expect(suggested.map((rule) => [rule.from[0], rule.to![0]])).toEqual([
    ["ui", "store"],
    ["store", "ui"],
    ["api", "jobs"],
    ["jobs", "api"],
    ["store", "jobs"],
    ["jobs", "store"],
  ]);
  expect(suggested.every((rule) => rule.kind === "forbid" && rule.reason === SUGGESTED_REASON)).toBe(true);
});
