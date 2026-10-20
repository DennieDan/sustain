// LRN-02: the Java rule tables on an AB3-style fixture. Generic type arguments, strings and comments
// are never mutated, and each Java kind rewrites one token.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { mutateText } from "../../../src/agent/modes/bugfix/mutations";
import type { MutationKind } from "../../../src/model/session";
import { repoRoot } from "../support/sourceScan";
import { put, runScript, tempDir } from "../support/temp";

const FIXTURE = readFileSync(join(repoRoot, "test/fixtures/java/DeleteCommand.java"), "utf8");

function mutated(line: number, kind: MutationKind): string | null {
  try {
    return mutateText(FIXTURE, line, kind, "java").buggyHunk.trim();
  } catch {
    return null;
  }
}

describe("LRN-02 Java kinds", () => {
  test.each([
    [21, "off-by-one", "if (targetIndex.getZeroBased() > lastShownList.size()) {"],
    [25, "off-by-one", "for (int i = 0; i <= lastShownList.size(); i++) {"],
    [45, "off-by-one", "return items.size() >= 1 ? sort(items) : items;"],
    [49, "off-by-one", "return isValid(index <= size, size > 0);"],
    [53, "off-by-one", "return count <= MAX_PERSONS && count > 0;"],
    [21, "flipped-comparison", "if (targetIndex.getZeroBased() <= lastShownList.size()) {"],
    [41, "flipped-comparison", "return otherPerson == null && otherPerson.getName().equals(getName());"],
    [27, "and-or-swap", "if (person.isTagged() || !person.getName().equals(personToKeep.getName())) {"],
    [37, "and-or-swap", "return other == this || (other instanceof DeleteCommand || targetIndex.equals(((DeleteCommand) other).targetIndex));"],
    [41, "reference-equality", "return otherPerson != null && otherPerson.getName() == getName();"],
    [27, "reference-equality", "if (person.isTagged() && person.getName() != personToKeep.getName()) {"],
  ] as const)("line %i, %s: %s", (line, kind, expected) => {
    expect(mutated(line, kind)).toBe(expected);
  });

  test.each([
    [10, "off-by-one", "a < inside a string"],
    [20, "off-by-one", "List<Person> is a type"],
    [24, "flipped-comparison", "Map<String, List<Tag>> and HashMap<> are types"],
    [44, "off-by-one", "a generic method's type parameters"],
    [31, "and-or-swap", "a comment"],
    [37, "reference-equality", "an argument with a cast inside"],
    [32, "reference-equality", "no equals call"],
  ] as const)("line %i has no %s target: %s", (line, kind, _why) => {
    expect(mutated(line, kind)).toBeNull();
  });

  test("missing-await does not apply to Java, and the Java kinds do not apply to TypeScript", () => {
    expect(() => mutateText(FIXTURE, 21, "missing-await", "java")).toThrow('"missing-await" does not apply to Java');
    expect(() => mutateText("if (a && b) {}\n", 1, "and-or-swap", "js")).toThrow('"and-or-swap" does not apply to JavaScript and TypeScript');
  });
});

test("LRN-02 inject seeds a Java kind in a .java file and refuses a kind Java does not offer", () => {
  const root = tempDir();
  put(root, "src/DeleteCommand.java", FIXTURE);
  runScript("session", ["init", "--mode", "bugfix"], { cwd: root });
  runScript("session", ["plan", "--steps", '[{"title":"Delete","files":["src/DeleteCommand.java"]}]'], { cwd: root });
  const refused = runScript("session", ["inject", "--file", "src/DeleteCommand.java", "--line", "21", "--kind", "missing-await"], { cwd: root });
  expect(refused.status).toBe(1);
  expect(refused.json()).toMatchObject({ status: "error", message: expect.stringContaining('"missing-await" does not apply to Java') });
  const seeded = runScript("session", ["inject", "--file", "src/DeleteCommand.java", "--line", "41", "--kind", "reference-equality"], { cwd: root });
  expect(seeded.json()).toMatchObject({ status: "ok", kind: "reference-equality" });
  expect(readFileSync(join(root, "src/DeleteCommand.java"), "utf8").split("\n")[40]!.trim()).toBe("return otherPerson != null && otherPerson.getName() == getName();");
});
