// SET-05: the usage log counts a fixed set of actions per day, keeps 90 days, and holds nothing else.
import { expect, test } from "vitest";
import { emptyUsageLog, recordUsage, USAGE_DAYS, usageExport } from "../../../src/model/usageLog";

test("SET-05 each listed action is counted on its day, and anything else is not recorded", () => {
  let log = emptyUsageLog();
  const day = new Date("2026-10-19T10:00:00Z");
  for (const event of ["generate", "generate", "ask", "/home/dev/secret-repo", "Orders API"]) log = recordUsage(log, event, day);
  log = recordUsage(log, "refresh", new Date("2026-10-20T08:00:00Z"));
  expect(log).toEqual({ schema: 1, days: { "2026-10-19": { generate: 2, ask: 1 }, "2026-10-20": { refresh: 1 } } });
  expect(usageExport(log)).not.toMatch(/secret|Orders|home/);
});

test("SET-05 days older than the log keeps are dropped", () => {
  let log = recordUsage(emptyUsageLog(), "find", new Date("2026-07-01T10:00:00Z"));
  log = recordUsage(log, "find", new Date("2026-07-20T10:00:00Z"));
  log = recordUsage(log, "tour", new Date(new Date("2026-07-20T10:00:00Z").getTime() + (USAGE_DAYS - 1) * 86_400_000));
  expect(Object.keys(log.days)).toEqual(["2026-07-20", "2026-10-17"]);
});
