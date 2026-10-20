// PRC-04: the Action on a recorded pull_request payload, with a fake GitHub API.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildAction } from "../../esbuild.mjs";
import type { Comment, GitHubClient } from "../../action/src/github";
import { runAction } from "../../action/src/main";
import { COMMENT_MARKER } from "../../src/model/deltaMarkdown";
import { repoRoot } from "./support/sourceScan";
import { git, gitRepo, put, runScript } from "./support/temp";

const EVENT: unknown = JSON.parse(readFileSync(join(repoRoot, "test/fixtures/action/pull_request.json"), "utf8"));
const HANDLER = ["export function handle(req) {", "  return save(req);", "}", ""].join("\n");
const HOSTILE = '</details><img src=x onerror=alert(1)>"]; click n1 "javascript:x';

/** The fake API: comments live in memory, and every call is recorded. */
function fakeGitHub(existing: Comment[] = []): GitHubClient & { comments: Comment[]; calls: string[] } {
  const comments = [...existing];
  const calls: string[] = [];
  return {
    comments,
    calls,
    async listComments(issue) {
      calls.push(`list ${issue}`);
      return comments;
    },
    async createComment(issue, body) {
      calls.push(`create ${issue}`);
      comments.push({ id: Math.max(0, ...comments.map((comment) => comment.id)) + 1, body });
    },
    async updateComment(id, body) {
      calls.push(`update ${id}`);
      comments.find((comment) => comment.id === id)!.body = body;
    },
  };
}

/** A checkout of the pull request: origin/main has the map; HEAD edits the API and adds payments. */
function checkout(label = "API"): string {
  const root = gitRepo({ "src/api/handler.ts": HANDLER, "src/store/db.ts": "export const db = {};\n" });
  const facts = runScript("repo-facts", [], { cwd: root }).json();
  put(
    root,
    facts.draft,
    JSON.stringify({
      meta: { title: "Shop" },
      components: [
        { id: "api", type: "backend", label, sources: [{ path: "src/api/handler.ts", line: 1, end_line: 3 }] },
        { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
      ],
      connections: [{ id: "api-store", from: "api", to: "store" }],
    }),
  );
  expect(runScript("validate", [facts.draft], { cwd: root }).status).toBe(0);
  git(root, "add", ".");
  git(root, "commit", "-qm", "map");
  git(root, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(root, "checkout", "-qb", "feature");
  put(root, "src/api/handler.ts", HANDLER.replace("save(req)", "store(req)"));
  for (const name of ["a", "b", "c"]) put(root, `src/payments/${name}.ts`, `export const ${name} = 1;\n`);
  git(root, "add", ".");
  git(root, "commit", "-qm", "payments");
  return root;
}

function env(inputs: Record<string, string> = {}): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries({ "fail-on": "", map: "", comment: "true", ...inputs }).map(([key, value]) => [`INPUT_${key.toUpperCase()}`, value]));
}

describe("PRC-04 the Action", () => {
  test("it posts one marked comment with the report and a Mermaid chart, then updates it", async () => {
    const root = checkout();
    const github = fakeGitHub([{ id: 7, body: "an unrelated comment" }]);
    const log: string[] = [];
    const first = await runAction({ env: env(), root, event: EVENT, client: github, log: (line) => log.push(line) });
    expect(first).toMatchObject({ exitCode: 0, result: "pass" });
    expect(github.calls).toEqual(["list 42", "create 42"]);
    const body = github.comments[1]!.body;
    expect(body.startsWith(`${COMMENT_MARKER}\n### Sustain check: pass`)).toBe(true);
    expect(body).toContain("**Touched boxes**");
    expect(body).toContain("**New box candidates**\n\n- `src/payments/`: 3 files, 3 lines. Suggested box: payments");
    expect(body).toContain("```mermaid\nflowchart LR");
    expect(log).toEqual(["Sustain check: pass"]);

    await runAction({ env: env(), root, event: EVENT, client: github, log: () => undefined });
    expect(github.calls.slice(2)).toEqual(["list 42", "update 8"]);
    expect(github.comments).toHaveLength(2);
  });

  test("fail-on sets the job result", async () => {
    const root = checkout();
    const result = await runAction({ env: env({ "fail-on": "stale, new-box" }), root, event: EVENT, client: fakeGitHub(), log: () => undefined });
    expect([result.exitCode, result.result]).toEqual([1, "fail"]);
    expect(result.comment).toContain("Failed on: 1 stale or gone box\\(es\\); 1 new box candidate\\(s\\).");
  });

  test("hostile labels stay text in the comment and in the chart", async () => {
    const root = checkout(HOSTILE);
    const result = await runAction({ env: env(), root, event: EVENT, client: fakeGitHub(), log: () => undefined });
    expect(result.comment).not.toContain("<img");
    expect(result.comment).not.toContain("</details>");
    expect(result.comment).toContain('n0["#lt;/details#gt;#lt;img src=x onerror=alert(1)#gt;#quot;]; click n1 #quot;javascript:x"]:::strong');
  });

  test("comment false calls no API; a non-pull-request event or a bad input is an error", async () => {
    const root = checkout();
    const quiet = fakeGitHub();
    expect((await runAction({ env: env({ comment: "false" }), root, event: EVENT, client: quiet, log: () => undefined })).result).toBe("pass");
    expect(quiet.calls).toEqual([]);
    expect(await runAction({ env: env(), root, event: { push: {} }, client: quiet, log: () => undefined })).toEqual({ exitCode: 1, result: "error", comment: null });
    expect((await runAction({ env: env({ "fail-on": "everything" }), root, event: EVENT, client: quiet, log: () => undefined })).result).toBe("error");
  });

  test("the committed bundle is what the build makes now", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sustain-action-"));
    try {
      await buildAction(join(dir, "index.js"));
      expect(readFileSync(join(dir, "index.js"), "utf8")).toBe(readFileSync(join(repoRoot, "action/dist/index.js"), "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

