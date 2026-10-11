// FR-NAV-02/03: how a clicked source resolves (open with lines, open stale, or refuse).
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { resolveSource } from "../../../src/extension/sourceTarget";
import { put, tempDir } from "../support/temp";

function repo(): { base: string; root: string } {
  const base = tempDir();
  const root = join(base, "repo");
  put(root, "src/a.ts", "1\n2\n3\n4\n5\n");
  put(root, "logo.png", Buffer.from([0x89, 0x00, 0x01]));
  put(base, "outside.txt", "x\n");
  symlinkSync(join(base, "outside.txt"), join(root, "leak.txt"));
  return { base, root };
}

describe("FR-NAV-02 open", () => {
  test("line and end_line select the whole range", () => {
    const { root } = repo();
    expect(resolveSource(root, { path: "src/a.ts", line: 2, end_line: 4 })).toEqual({ kind: "open", file: join(root, "src/a.ts"), lines: { start: 2, end: 4 } });
  });

  test("line only selects that line", () => {
    const { root } = repo();
    expect(resolveSource(root, { path: "src/a.ts", line: 5 })).toEqual({ kind: "open", file: join(root, "src/a.ts"), lines: { start: 5, end: 5 } });
  });

  test.each([[{}], [{ end_line: 3 }], [{ line: 0 }], [{ line: 2.5 }]])("no usable line (%o) opens at the top without a selection", (lines) => {
    const { root } = repo();
    expect(resolveSource(root, { path: "src/a.ts", ...lines })).toEqual({ kind: "open", file: join(root, "src/a.ts") });
  });

  test("an end_line before line selects just the line", () => {
    const { root } = repo();
    expect(resolveSource(root, { path: "src/a.ts", line: 3, end_line: 1 })).toMatchObject({ lines: { start: 3, end: 3 } });
  });

  test("a binary file opens without a line check", () => {
    const { root } = repo();
    expect(resolveSource(root, { path: "logo.png", line: 9 })).toEqual({ kind: "open", file: join(root, "logo.png"), lines: { start: 9, end: 9 } });
  });
});

describe("FR-NAV-03 stale references", () => {
  test.each(["/etc/hosts", "../repo/src/a.ts", "src\\a.ts", "src//a.ts", "C:/x.ts", "leak.txt"])("%s is an invalid source path", (path) => {
    expect(resolveSource(repo().root, { path })).toEqual({ kind: "error", message: `Invalid source path: \`${path}\`` });
  });

  test.each(["src/gone.ts", "src", "src/a.ts/child"])("%s no longer exists", (path) => {
    expect(resolveSource(repo().root, { path, line: 1 })).toEqual({ kind: "error", message: `Stale reference: \`${path}\` no longer exists` });
  });

  test.each([
    [{ line: 6 }, "6"],
    [{ line: 4, end_line: 9 }, "4–9"],
    [{ line: 7, end_line: 9 }, "7–9"],
  ])("lines %o beyond the file open it without a selection and report the counts", (lines, cited) => {
    const { root } = repo();
    expect(resolveSource(root, { path: "src/a.ts", ...lines })).toEqual({
      kind: "open",
      file: join(root, "src/a.ts"),
      warning: `Stale reference: \`src/a.ts\` has 5 lines; the diagram cites ${cited}`,
    });
  });
});
