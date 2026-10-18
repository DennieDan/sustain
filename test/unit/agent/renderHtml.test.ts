// RCH-01: render-html.mjs writes the accepted map's page beside it, with the root only locally.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { put, runScript, tempDir } from "../support/temp";

const RUN = "architecture-page-20261018-120000";

/** A repository with an accepted map whose box has `label`. The validator sets meta.output. */
function accepted(label: string): { root: string; candidate: string } {
  const root = tempDir();
  put(root, "src/a.ts", "export const handle = () => save();\n");
  put(root, `.archify/${RUN}/draft.json`, JSON.stringify({ meta: { title: "Page" }, components: [{ id: "a", type: "backend", label, sources: [{ path: "src/a.ts", line: 1 }] }] }));
  expect(runScript("validate", [`.archify/${RUN}/draft.json`], { cwd: root }).status).toBe(0);
  return { root, candidate: `.archify/${RUN}/candidate.json` };
}

describe("RCH-01 render-html", () => {
  test("writes meta.output with the map and the root, one executable script, and no file content", () => {
    const { root, candidate } = accepted("</script><img src=x onerror=alert(1)>");
    const run = runScript("render-html", [candidate], { cwd: root });
    expect(run.stderr).toBe("");
    expect(run.json()).toEqual({ status: "written", page: `.archify/${RUN}/page.html` });
    const html = readFileSync(join(root, ".archify", RUN, "page.html"), "utf8");
    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(html).not.toContain("<img");
    expect(html).toContain(`"root":${JSON.stringify(root)}`);
    expect(html).not.toContain("export const handle");
  });

  test("--share leaves the absolute root out", () => {
    const { root, candidate } = accepted("API");
    expect(runScript("render-html", [candidate, "--share"], { cwd: root }).status).toBe(0);
    const html = readFileSync(join(root, ".archify", RUN, "page.html"), "utf8");
    expect(html).not.toContain(root);
    expect(html).toContain('"root":null');
  });

  test.each([[["src/a.ts"]], [[".archify/x/candidate.json"]], [[".archify/architecture-page-20261018-120000/candidate.json", "--other"]], [[]]])(
    "%j is refused with exit 2",
    (args) => {
      const { root } = accepted("API");
      expect(runScript("render-html", args, { cwd: root }).status).toBe(2);
      expect(existsSync(join(root, ".archify", RUN, "page.html"))).toBe(false);
    },
  );
});
