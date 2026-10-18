// SKL-03: the practice log lists finished bug hunts, fully graded explain-backs and finished tours,
// newest first with their dates.
import { expect, test } from "vitest";
import type { LeaderboardEntry } from "../../../src/model/leaderboard";
import type { PracticeCheck } from "../../../src/model/practice";
import { practiceLog } from "../../../src/model/practiceLog";

function hunt(fields: Partial<LeaderboardEntry>): LeaderboardEntry {
  return { run: "bugfix-demo-20261018-120000", mode: "bugfix", status: "completed", score: 30, bugs: 2, found: 2, fixed: 2, hintCost: 0, startedAt: "2026-10-18T12:00:00Z", endedAt: "2026-10-18T12:40:00Z", ...fields };
}

function check(grades: ("correct" | "partial" | "wrong" | null)[], startedAt: string): PracticeCheck {
  return {
    root: "/r",
    scope: "This branch's changes",
    agent: "Claude Code",
    status: "done",
    error: null,
    startedAt,
    questions: grades.map((grade, index) => ({
      question: `Q${index}`,
      key: `K${index}`,
      citation: { path: "src/a.ts", line: 1, endLine: null },
      answer: grade === null ? null : "A",
      status: grade === null ? "open" : "graded",
      grade: grade === null ? null : { grade, reason: "R", citation: null },
      error: null,
    })),
  };
}

test("SKL-03 finished hunts, fully graded explain-backs and finished tours are listed newest first with their dates", () => {
  const log = practiceLog(
    [hunt({}), hunt({ status: "abandoned", score: 0, fixed: 0, endedAt: "2026-10-17T09:00:00Z" }), hunt({ status: "active", endedAt: "2026-10-19T10:00:00Z" })],
    [check(["correct", "partial", "wrong"], "2026-10-19T08:00:00Z"), check(["correct", null, null], "2026-10-19T09:00:00Z")],
    [{ root: "/r", title: "Shop", stops: 6, finishedAt: "2026-10-18T15:00:00Z" }],
  );
  expect(log).toEqual([
    { kind: "explain", title: "Explain-back · This branch's changes", detail: "1 correct, 1 partial, 1 wrong", at: "2026-10-19T08:00:00Z" },
    { kind: "tour", title: "Tour of Shop", detail: "6 stops", at: "2026-10-18T15:00:00Z" },
    { kind: "hunt", title: "Bug hunt", detail: "30 points · 2 of 2 bugs fixed", at: "2026-10-18T12:40:00Z" },
    { kind: "hunt", title: "Bug hunt", detail: "0 points · 0 of 2 bugs fixed · abandoned", at: "2026-10-17T09:00:00Z" },
  ]);
});

test("SKL-03 the log keeps the newest entries up to its limit", () => {
  const tours = Array.from({ length: 5 }, (_, index) => ({ root: "/r", title: `Map ${index}`, stops: 4, finishedAt: `2026-10-1${index}T12:00:00Z` }));
  expect(practiceLog([], [], tours, 3).map((entry) => entry.title)).toEqual(["Tour of Map 4", "Tour of Map 3", "Tour of Map 2"]);
});
