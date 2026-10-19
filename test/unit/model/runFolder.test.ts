// FR-RF-01 slug/run-folder rules (ported from the prototype's repo/tests/run_storage.rs and
// storage.rs) plus draft location and atomic publish (FR-VAL-01, FR-VAL-06).
import { existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  createRunFolder,
  locateDraft,
  parseRunFolderName,
  publishCandidate,
  runTimestamp,
  SLUG_MAX,
  slugify,
} from "../../../src/model/runFolder";
import { put, tempDir } from "../support/temp";

describe("FR-RF-01 slug", () => {
  test.each([
    ["Payment service: retries & queues", "my-repo", "payment-service-retries-queues"],
    ["  Hello,   World!! ", "x", "hello-world"],
    ["V2 API", "x", "v2-api"],
    ["snake_case/and.dots", "x", "snake-case-and-dots"],
    ["Café déjà vu", "x", "caf-d-j-vu"],
    ["日本 auth 服务", "x", "auth"],
    ["The quick brown fox jumps over the lazy dog again and again", "x", "the-quick-brown-fox-jumps-over-the-lazy"],
    ["a".repeat(50), "x", "a".repeat(SLUG_MAX)],
    [`${"a".repeat(40)} bbb`, "x", "a".repeat(40)],
    ["", "My Repo!", "my-repo"],
    ["   ", "archalign", "archalign"],
    ["!!! ???", "Backend_API", "backend-api"],
    ["", "", "repo"],
    ["日本語", "中文", "repo"],
  ])("slugify(%j, %j) = %j", (focus, folder, expected) => {
    const slug = slugify(focus, folder);
    expect(slug).toBe(expected);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});

describe("FR-RF-01 run folders", () => {
  test("the timestamp is local wall-clock time", () => {
    expect(runTimestamp(new Date(2026, 9, 10, 9, 30, 5))).toBe("20261010-093005");
    expect(runTimestamp(new Date())).toMatch(/^\d{8}-\d{6}$/);
  });

  test("the run folder is created together with .archify", () => {
    const root = tempDir();
    expect(createRunFolder(root, "api", "20261010-093000")).toBe("architecture-api-20261010-093000");
    expect(existsSync(join(root, ".archify/architecture-api-20261010-093000"))).toBe(true);
  });

  test("collisions get -2, -3 suffixes", () => {
    const root = tempDir();
    const names = [0, 1, 2].map(() => createRunFolder(root, "api", "20261010-093000"));
    expect(names).toEqual(["architecture-api-20261010-093000", "architecture-api-20261010-093000-2", "architecture-api-20261010-093000-3"]);
    expect(names.map((name) => parseRunFolderName(name))).toEqual([
      { slug: "api", timestamp: "20261010-093000", n: 1 },
      { slug: "api", timestamp: "20261010-093000", n: 2 },
      { slug: "api", timestamp: "20261010-093000", n: 3 },
    ]);
  });

  test("fails when .archify links outside the root, is a file, or the name is not one segment", () => {
    const base = tempDir();
    put(base, "elsewhere/.keep", "");
    put(base, "repo/.keep", "");
    symlinkSync(join(base, "elsewhere"), join(base, "repo/.archify"));
    expect(() => createRunFolder(join(base, "repo"), "api", "20261010-093000")).toThrow(/inside the repository root/);
    expect(readdirSync(join(base, "elsewhere"))).toEqual([".keep"]);

    const fileRoot = tempDir();
    writeFileSync(join(fileRoot, ".archify"), "not a folder");
    expect(() => createRunFolder(fileRoot, "api", "20261010-093000")).toThrow();

    expect(() => createRunFolder(tempDir(), "a/b", "20261010-093000")).toThrow(/not a valid run folder name/);
  });

  test.each([
    ["architecture-api-20261010-093000", { slug: "api", timestamp: "20261010-093000", n: 1 }],
    ["architecture-api-20261010-093000-2", { slug: "api", timestamp: "20261010-093000", n: 2 }],
    ["architecture-core-api-20261010-093000", { slug: "core-api", timestamp: "20261010-093000", n: 1 }],
    ["hand-made", null],
    ["architecture-x-2026101-093000", null],
    ["", null],
  ])("parseRunFolderName(%j)", (name, expected) => {
    expect(parseRunFolderName(name)).toEqual(expected);
  });
});

describe("FR-VAL-01 draft location", () => {
  test("absolute and relative paths resolve to the repo root and run", () => {
    const root = tempDir();
    const rel = ".archify/architecture-api-20261010-093000/draft.json";
    const expected = { root, run: "architecture-api-20261010-093000", slug: "api", draft: join(root, rel) };
    expect(locateDraft(join(root, rel), "/")).toEqual(expected);
    expect(locateDraft(rel, root)).toEqual(expected);
    expect(locateDraft(`../${rel}`, join(root, "src"))).toEqual(expected);
  });

  test.each([
    [".archify/architecture-api-20261010-093000/candidate.sir", /expected a path/],
    ["runs/architecture-api-20261010-093000/draft.json", /expected a path/],
    [".archify/hand-made/draft.json", /does not match/],
  ])("%s is a usage error", (arg, message) => {
    expect(() => locateDraft(arg, tempDir())).toThrow(message);
  });
});

describe("FR-VAL-06 publish", () => {
  test("writes candidate.sir, deletes the draft and leaves no temp files", () => {
    const root = tempDir();
    const draft = put(root, ".archify/architecture-api-20261010-093000/draft.json", "{}");
    publishCandidate(draft, '{"a":1}\n');
    const dir = join(root, ".archify/architecture-api-20261010-093000");
    expect(readdirSync(dir)).toEqual(["candidate.sir"]);
    expect(readFileSync(join(dir, "candidate.sir"), "utf8")).toBe('{"a":1}\n');
  });

  test("replaces an existing candidate", () => {
    const root = tempDir();
    const dir = ".archify/architecture-api-20261010-093000";
    put(root, `${dir}/candidate.sir`, "old");
    const draft = put(root, `${dir}/draft.json`, "{}");
    publishCandidate(draft, "new\n");
    expect(readFileSync(join(root, dir, "candidate.sir"), "utf8")).toBe("new\n");
  });
});
