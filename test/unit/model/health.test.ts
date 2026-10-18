// ARC-05: the Health section's four lines, and the changed lines since the map that no box covers.
import { expect, test } from "vitest";
import { healthItems, uncoveredLines } from "../../../src/model/health";

test("ARC-05 changed lines no box owns are counted from the diff and new files, tests and other files left out", () => {
  const components = [{ id: "api", sources: [{ path: "src/api/handler.ts" }] }];
  const changes = [
    { path: "src/api/handler.ts", added: 30, deleted: 2 },
    { path: "src/api/routes.ts", added: 8, deleted: 0 },
    { path: "lib/util.ts", added: 12, deleted: 1 },
    { path: "lib/util.test.ts", added: 40, deleted: 0 },
    { path: "README.md", added: 9, deleted: 0 },
    { path: "assets/logo.png", added: null, deleted: null },
  ];
  expect(uncoveredLines(changes, [{ path: "jobs/run.py", lines: 20 }, { path: "jobs/empty.py", lines: 0 }], components)).toEqual({ lines: 32, files: 2 });
});

test("ARC-05 each line says how things stand, and the ones that need a look are marked", () => {
  const items = healthItems({ freshness: { changed: 3, total: 16 }, uncovered: { lines: 120, files: 4 }, violations: 1, hotspot: { label: "API", commits: 9 }, days: 90 });
  expect(items.map((item) => [item.kind, item.text, item.attention])).toEqual([
    ["freshness", "3 of 16 boxes changed since the map.", true],
    ["uncovered", "120 changed lines in 4 files are in no box.", true],
    ["violations", "1 import breaks a rule.", true],
    ["hotspot", "API changed most, with 9 commits in the last 90 days.", false],
  ]);
  expect(healthItems({ freshness: { changed: 0, total: 1 }, uncovered: { lines: 0, files: 0 }, violations: 0, hotspot: null, days: 30 }).map((item) => [item.text, item.attention])).toEqual([
    ["Every box matches its code.", false],
    ["Every changed line since the map is in a box.", false],
    ["No import breaks a rule.", false],
    ["No box's code changed in the last 30 days.", false],
  ]);
  expect(healthItems({ freshness: null, uncovered: null, violations: null, hotspot: null, days: 90 }).map((item) => item.text)).toEqual([
    "The map's freshness is unknown, because it has no fingerprints.",
    "Changes since the map cannot be measured without git.",
    "No architecture rules yet.",
    "No box's code changed in the last 90 days.",
  ]);
});
