// FRS-07: boxes and arrows added, removed and relabelled between two maps.
import { expect, test } from "vitest";
import { diffMaps, diffSummary } from "../../../src/model/diff";

const BEFORE = {
  components: [
    { id: "web", label: "Web", sources: [{ path: "src/web/a.ts" }] },
    { id: "api", label: "API", sources: [{ path: "src/api/a.ts" }, { path: "src/api/b.ts" }] },
    { id: "cache", label: "Cache", sources: [{ path: "src/cache/a.ts" }] },
    { id: "jobs", label: "Jobs", sources: [{ path: "src/jobs/a.ts" }] },
  ],
  connections: [
    { from: "web", to: "api", label: "calls" },
    { from: "api", to: "cache" },
    { from: "jobs", to: "api", label: "polls" },
  ],
};

const AFTER = {
  components: [
    { id: "web", label: "Web app", sources: [{ path: "src/web/a.ts" }] },
    { id: "server", label: "Server", sources: [{ path: "src/api/a.ts" }, { path: "src/api/b.ts" }, { path: "src/api/c.ts" }] },
    { id: "jobs", label: "Jobs", sources: [{ path: "src/jobs/a.ts" }] },
    { id: "mail", label: "Mail", sources: [{ path: "src/mail/a.ts" }] },
  ],
  connections: [
    { from: "web", to: "server", label: "requests" },
    { from: "jobs", to: "server", label: "polls" },
    { from: "server", to: "mail" },
  ],
};

test("FRS-07 boxes match by id or by citing mostly the same files, and arrows follow them", () => {
  const diff = diffMaps(BEFORE, AFTER);
  expect(diff).toEqual({
    boxes: {
      added: ["mail"],
      removed: [{ id: "cache", label: "Cache" }],
      relabelled: [
        { id: "web", was: "web", label: "Web" },
        { id: "server", was: "api", label: "API" },
      ],
    },
    arrows: {
      added: [2],
      removed: [{ from: "server", to: "cache" }],
      relabelled: [{ index: 0, was: "calls" }],
    },
  });
  expect(diffSummary(diff)).toBe("1 box added · 1 removed · 2 relabelled · 1 arrow added · 1 removed");
});

test("FRS-07 a map compared with itself has no changes", () => {
  const diff = diffMaps(BEFORE, BEFORE);
  expect(diffSummary(diff)).toBe("0 boxes added · 0 removed · 0 relabelled · 0 arrows added · 0 removed");
  expect(diff.arrows.relabelled).toEqual([]);
});
