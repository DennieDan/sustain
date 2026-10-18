// ACC-05: audit-record.mjs checks the audit skill's draft against the map and the code, writes
// audit.json, and removes the draft.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { put, runScript, tempDir } from "../support/temp";

const RUN = "architecture-shop-20261018-120000";
const DRAFT = `.archify/${RUN}/audit-draft.json`;

/** A repository with an accepted map: web and api boxes, one arrow from web to api. */
function audited(draft: unknown): string {
  const root = tempDir();
  put(root, "src/web.ts", "import { api } from './api';\nexport const web = () => api();\n");
  put(root, "src/api.ts", "export const api = () => 1;\n");
  put(root, ".env", "KEY=1\n");
  put(
    root,
    `.archify/${RUN}/candidate.json`,
    JSON.stringify({
      schema_version: 1,
      diagram_type: "architecture",
      meta: { title: "Shop" },
      components: [
        { id: "web", type: "frontend", label: "Web", sources: [{ path: "src/web.ts", line: 2 }] },
        { id: "api", type: "backend", label: "API", sources: [{ path: "src/api.ts", line: 1 }] },
      ],
      connections: [{ from: "web", to: "api", label: "calls" }],
    }),
  );
  put(root, DRAFT, typeof draft === "string" ? draft : JSON.stringify(draft));
  return root;
}

const GOOD = {
  boxes: [
    { component: "web", verdict: "supports", reason: "Calls the API when the page loads." },
    { component: "api", verdict: "partial", reason: "Returns a constant; no request handling is cited." },
  ],
  arrows: [{ connection: 0, from: "web", to: "api", evidence: [{ path: "src/web.ts", line: 1, end_line: 2 }] }],
};

test("ACC-05 a complete draft is recorded as audit.json with its date, and the draft is removed", () => {
  const root = audited(GOOD);
  const run = runScript("audit-record", [DRAFT], { cwd: root });
  expect(run.stderr).toBe("");
  expect(run.status).toBe(0);
  expect(run.json()).toEqual({ status: "recorded", audit: `.archify/${RUN}/audit.json`, boxes: { supports: 1, partial: 1, contradicts: 0 }, arrowsWithoutEvidence: 0 });
  const audit = JSON.parse(readFileSync(join(root, ".archify", RUN, "audit.json"), "utf8"));
  expect(audit).toEqual({ schema: 1, createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), ...GOOD });
  expect(existsSync(join(root, DRAFT))).toBe(false);
});

test("ACC-05 the draft's shape is checked first: verdicts, reasons of at most 200 characters, and no extra fields", () => {
  const draft = structuredClone(GOOD) as { boxes: Record<string, unknown>[] };
  draft.boxes[0]!["reason"] = "x".repeat(201);
  draft.boxes[1]!["verdict"] = "unsure";
  draft.boxes[1]!["code"] = "export const api";
  const run = runScript("audit-record", [DRAFT], { cwd: audited(draft) });
  expect(run.status).toBe(1);
  expect(run.json().errors.map((error: { pointer: string }) => error.pointer)).toEqual(["/boxes/0/reason", "/boxes/1", "/boxes/1/verdict"]);
});

test("ACC-05 every box and arrow needs exactly one entry that matches the map", () => {
  const draft = {
    boxes: [GOOD.boxes[0], GOOD.boxes[0], { component: "db", verdict: "supports", reason: "x" }],
    arrows: [{ connection: 0, from: "api", to: "web", evidence: [] }, { connection: 3, from: "web", to: "api", evidence: [] }],
  };
  const run = runScript("audit-record", [DRAFT], { cwd: audited(draft) });
  expect(run.status).toBe(1);
  expect(run.json().errors).toEqual([
    { pointer: "/boxes/1", message: 'box "web" has a verdict already' },
    { pointer: "/boxes/2/component", message: 'the map has no box "db"' },
    { pointer: "/boxes", message: 'box "api" has no verdict' },
    { pointer: "/arrows/0", message: 'arrow 0 runs from "web" to "api"' },
    { pointer: "/arrows/1/connection", message: "the map has no arrow 3" },
  ]);
  const missing = runScript("audit-record", [DRAFT], { cwd: audited({ ...GOOD, arrows: [] }) });
  expect(missing.json().errors).toEqual([{ pointer: "/arrows", message: 'arrow 0, from "web" to "api", has no entry' }]);
});

test("ACC-05 arrow evidence passes the same path, deny-list and line checks as a map citation", () => {
  const draft = structuredClone(GOOD) as { arrows: { evidence: { path: string; line?: number; end_line?: number }[] }[] };
  draft.arrows[0]!.evidence = [{ path: ".env", line: 1 }, { path: "src/api.ts", line: 9 }, { path: "../outside.ts" }];
  const run = runScript("audit-record", [DRAFT], { cwd: audited(draft) });
  expect(run.status).toBe(1);
  expect(run.json().errors.map((error: { pointer: string }) => error.pointer)).toEqual(["/arrows/0/evidence/0/path", "/arrows/0/evidence/1/line", "/arrows/0/evidence/2/path"]);
  expect(existsSync(join(audited(GOOD), ".archify", RUN, "audit.json"))).toBe(false);
});

test("ACC-05 a path that is not a run folder's audit-draft.json is a usage error", () => {
  const root = audited(GOOD);
  const run = runScript("audit-record", [`.archify/${RUN}/draft.json`], { cwd: root });
  expect([run.status, run.stdout]).toEqual([2, ""]);
  expect(run.stderr).toContain("expected a path of the form");
});
