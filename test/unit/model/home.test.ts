// UI-01, UI-04, CST-04, FRS-03: the sidebar's wording, its maps list and finding the run a Generate made.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { clock, freshnessHeader, mapStatus, relativeAge, runFigures, statusText, tokenCount } from "../../../src/model/home";
import { listMaps } from "../../../src/model/maps";
import type { MapItem, RunCard } from "../../../src/model/messages";
import { newRunRecord, newRunSince, runFolderNames, writeRunRecord } from "../../../src/model/runRecord";
import { put, tempDir } from "../support/temp";

const NOW = new Date("2026-10-18T12:00:00Z");

function map(fields: Partial<MapItem>): MapItem {
  return { runFolder: "architecture-x-20261016-120000", file: "/r/c.json", title: null, focus: "", agent: null, createdAt: "2026-10-16T12:00:00Z", boxes: 16, changed: null, ...fields };
}

function run(fields: Partial<RunCard>): RunCard {
  return {
    agent: "Claude Code",
    mode: "sidebar",
    focus: "",
    status: "running",
    phase: null,
    attempts: 0,
    runFolder: null,
    feed: [],
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: null,
    estimate: null,
    denials: [],
    startedAt: "2026-10-18T11:58:28Z",
    finishedAt: null,
    ...fields,
  };
}

describe("UI-01 wording", () => {
  test("ages read as the largest whole unit", () => {
    expect(relativeAge("2026-10-18T11:59:30Z", NOW)).toBe("just now");
    expect(relativeAge("2026-10-18T11:59:00Z", NOW)).toBe("1 minute ago");
    expect(relativeAge("2026-10-18T07:00:00Z", NOW)).toBe("5 hours ago");
    expect(relativeAge("2026-10-16T12:00:00Z", NOW)).toBe("2 days ago");
  });

  test("the header states the newest map's age and boxes, or that there is none", () => {
    expect(mapStatus([], NOW)).toBe("No map yet");
    expect(mapStatus([map({}), map({ boxes: 3 })], NOW)).toBe("Map from 2 days ago · 16 boxes");
    expect(mapStatus([map({ boxes: 1, createdAt: NOW.toISOString() })], NOW)).toBe("Map from just now · 1 box");
  });

  test("the run card shows elapsed time, tokens and cost when known", () => {
    expect(clock(92_000)).toBe("1:32");
    expect(clock(3_725_000)).toBe("1:02:05");
    expect(tokenCount(950)).toBe("950");
    expect(tokenCount(18_240)).toBe("18k");
    expect(tokenCount(1_240)).toBe("1.2k");
    expect(runFigures(run({}), NOW)).toBe("1:32");
    const finished = run({ usage: { input: 8300, output: 1190, cacheRead: 15000, cacheWrite: 500 }, costUsd: 0.4123, finishedAt: "2026-10-18T11:59:59Z" });
    expect(runFigures(finished, NOW)).toBe("1:31 · 24k in · 1.2k out · $0.41");
  });
});

describe("UI-04 status bar", () => {
  test("idle, generating with the clock, and changed boxes", () => {
    expect(statusText({ runningSince: null, changed: 0 }, NOW)).toBe("Sustain");
    expect(statusText({ runningSince: "2026-10-18T11:58:28Z", changed: 3 }, NOW)).toBe("Sustain: generating 1:32");
    expect(statusText({ runningSince: null, changed: 3 }, NOW)).toBe("Sustain: 3 changed");
  });
});

describe("UI-01 maps list", () => {
  test("each candidate is listed newest first with its title, boxes and run record", () => {
    const root = tempDir();
    const older = join(root, ".archify/architecture-old-20261001-090000");
    put(older, "candidate.json", JSON.stringify({ meta: { title: "Old map" }, components: [{ id: "a", label: "A", type: "backend" }] }));
    const newer = join(root, ".archify/architecture-pay-20261017-090000");
    put(newer, "candidate.json", JSON.stringify({ components: [{ id: "a", label: "A", type: "backend" }, { id: "b", label: "B", type: "frontend" }] }));
    writeRunRecord(root, newer, { ...newRunRecord({ focus: "payments", skillVersion: "0.3.0" }, new Date("2026-10-17T09:00:00Z")), agent: "Codex" });
    mkdirSync(join(root, ".archify/architecture-running-20261018-090000"));

    const maps = listMaps(root);
    expect(maps.map((item) => [item.runFolder, item.title, item.boxes, item.focus, item.agent])).toEqual([
      ["architecture-pay-20261017-090000", null, 2, "payments", "Codex"],
      ["architecture-old-20261001-090000", "Old map", 1, "", null],
    ]);
    expect(maps[0]!.createdAt).toBe("2026-10-17T09:00:00.000Z");
  });

  test("an unreadable candidate is still listed, by folder", () => {
    const root = tempDir();
    put(root, ".archify/architecture-bad-20261001-090000/candidate.json", "{ not json");
    expect(listMaps(root).map((item) => [item.title, item.boxes])).toEqual([[null, null]]);
  });
});

describe("CST-04 the run a Generate made", () => {
  function runAt(root: string, folder: string, at: string): void {
    const dir = join(root, ".archify", folder);
    mkdirSync(dir, { recursive: true });
    writeRunRecord(root, dir, newRunRecord({ focus: folder, skillVersion: "x" }, new Date(at)));
  }

  test("only folders created since the snapshot count, and the latest record wins", () => {
    const root = tempDir();
    runAt(root, "architecture-before-20261018-110000", "2026-10-18T11:00:00Z");
    const before = runFolderNames(root);
    expect(newRunSince(root, before)).toBeNull();
    mkdirSync(join(root, ".archify/no-record"));
    runAt(root, "architecture-a-20261018-120000", "2026-10-18T12:00:00Z");
    runAt(root, "architecture-b-20261018-120100", "2026-10-18T12:01:00Z");
    expect(newRunSince(root, before)?.runFolder).toBe("architecture-b-20261018-120100");
  });

  test("a folder without .archify gives an empty snapshot", () => {
    expect(runFolderNames(tempDir()).size).toBe(0);
  });
});

describe("FRS-03 freshness wording", () => {
  test("the header counts changed boxes since the map's revision and age, and is absent when none changed", () => {
    expect(freshnessHeader(3, 16, "abc1234def", "2026-10-16T12:00:00Z", NOW)).toBe("3 of 16 boxes changed since this map (abc1234, 2 days ago)");
    expect(freshnessHeader(1, 1, null, "2026-10-18T11:00:00Z", NOW)).toBe("1 of 1 box changed since this map (1 hour ago)");
    expect(freshnessHeader(0, 16, "abc1234", "2026-10-16T12:00:00Z", NOW)).toBeNull();
  });

  test("the sidebar header adds the newest map's changed boxes", () => {
    expect(mapStatus([map({ changed: 3 })], NOW)).toBe("Map from 2 days ago · 16 boxes · 3 changed");
    expect(mapStatus([map({ changed: 0 })], NOW)).toBe("Map from 2 days ago · 16 boxes");
  });
});
