// ARC-05: the Health section's lines, and the ones that need a look are marked.
import { expect, test } from "vitest";
import { healthItems } from "../../../src/model/health";

test("ARC-05 each line says how things stand, and the ones that need a look are marked", () => {
  const items = healthItems({ violations: 1, hotspot: { label: "API", commits: 9 }, days: 90 });
  expect(items.map((item) => [item.kind, item.text, item.attention])).toEqual([
    ["violations", "1 import breaks a rule.", true],
    ["hotspot", "API changed most, with 9 commits in the last 90 days.", false],
  ]);
  expect(healthItems({ violations: 0, hotspot: null, days: 30 }).map((item) => [item.text, item.attention])).toEqual([
    ["No import breaks a rule.", false],
    ["No box's code changed in the last 30 days.", false],
  ]);
  expect(healthItems({ violations: null, hotspot: null, days: 90 }).map((item) => item.text)).toEqual([
    "No architecture rules yet.",
    "No box's code changed in the last 90 days.",
  ]);
});
