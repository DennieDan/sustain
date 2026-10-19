// A baseline/open diagram pair and the host's Compare for the change view DOM tests
// (FR-CMP-09..12). Statuses of the open diagram against the baseline:
// components web changed (label), api kept (touched, unchanged), db added; connections c1 changed
// (label), c2 added; boundaries "Application" renamed (from "App"), "Data" added. Removed:
// component "Old", connection API → Old, boundary "Legacy".
import type { ComparisonContext } from "../../../src/model/comparison";
import type { Compare } from "../../../src/model/messages";
import type { RunChanges } from "../../../src/model/runChanges";

export const BASELINE_DOC = {
  components: [
    { id: "web", label: "Web", type: "frontend", sources: [{ path: "web/main.ts" }] },
    { id: "api", label: "API", type: "backend", sources: [{ path: "api/main.go" }] },
    { id: "old", label: "Old", type: "backend" },
  ],
  connections: [
    { id: "c1", from: "web", to: "api", label: "calls" },
    { id: "c3", from: "api", to: "old" },
  ],
  boundaries: [
    { kind: "region", label: "App", wraps: ["web", "api"] },
    { kind: "region", label: "Legacy", wraps: ["old"] },
  ],
};

export const CURRENT_DOC = {
  components: [
    { id: "web", label: "Web app", type: "frontend", sources: [{ path: "web/main.ts" }] },
    { id: "api", label: "API", type: "backend", sources: [{ path: "api/main.go", line: 9 }] },
    { id: "db", label: "DB", type: "database" },
  ],
  connections: [
    { id: "c1", from: "web", to: "api", label: "REST" },
    { id: "c2", from: "api", to: "db" },
  ],
  boundaries: [
    { kind: "region", label: "Application", wraps: ["web", "api"] },
    { kind: "region", label: "Data", wraps: ["db"] },
  ],
};

export const BASE_REVISION = "1234567890abcdef1234567890abcdef12345678";
export const HEAD_REVISION = "fedcba0987654321fedcba0987654321fedcba09";

export const CHANGES: RunChanges = {
  baseRevision: BASE_REVISION,
  revision: HEAD_REVISION,
  touchedComponents: [
    { id: "api", files: [{ status: "M", path: "api/main.go" }, { status: "D", path: "api/gone.go" }, { status: "R", path: "api/new.go", oldPath: "api/old.go" }] },
    { id: "web", files: [{ status: "A", path: "web/new.ts" }] },
  ],
  uncited: [
    { status: "A", path: "docs/notes.md" },
    { status: "D", path: "tmp/x.txt" },
    { status: "R", path: "b/new.txt", oldPath: "a/old.txt" },
  ],
};

export function context(overrides: Partial<ComparisonContext> = {}): ComparisonContext {
  return {
    baselineRun: "2026-10-01-1200-orders",
    currentRun: "2026-10-18-0900-orders",
    warnings: [],
    approximate: false,
    keptAvailable: true,
    keptNote: false,
    baselineCommit: { revision: BASE_REVISION, subject: "Add orders", committedAt: "2026-10-16T09:00:00Z", dirtyCount: 3 },
    currentCommit: { revision: HEAD_REVISION, subject: "Split API", committedAt: "2026-10-18T08:00:00Z", dirtyCount: 0 },
    ...overrides,
  };
}

export function compare(overrides: Partial<ComparisonContext> = {}, changes: RunChanges | null = CHANGES): Compare {
  return { baselineDoc: BASELINE_DOC, baselineFile: "/r/.archify/2026-10-01-1200-orders/candidate.json", context: context(overrides), changes };
}

/** "Now" for relative dates: 2026-10-19T12:00:00Z. */
export const NOW = new Date("2026-10-19T12:00:00Z");
