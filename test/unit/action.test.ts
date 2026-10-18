// PRC-04 and CLD-09: the Action on a recorded pull_request payload, with a fake GitHub API and a
// fake cloud.
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
      connections: [{ from: "api", to: "store" }],
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
  return Object.fromEntries(Object.entries({ "fail-on": "", map: "", comment: "true", upload: "false", "cloud-url": "", ...inputs }).map(([key, value]) => [`INPUT_${key.toUpperCase()}`, value]));
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

describe("CLD-09 the Action's upload", () => {
  test("with upload, the check and its map go to the cloud signed by the job's OIDC token, and the comment links the page", async () => {
    const root = checkout();
    const calls: { url: string; auth: string | null; body: any }[] = [];
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(url), auth: headers.get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).startsWith("https://actions.test/")) return Response.json({ value: "oidc-jwt" });
      return Response.json({ status: "accepted", id: 3, url: "/acme/shop/pull/42" }, { status: 201 });
    }) as typeof fetch;
    const result = await runAction({
      env: {
        ...env({ upload: "true", "cloud-url": "https://cloud.test/" }),
        GITHUB_REPOSITORY: "acme/shop",
        ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.test/token?run=1",
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-token",
      },
      root,
      event: EVENT,
      client: fakeGitHub(),
      log: () => undefined,
      fetcher,
    });
    expect(calls.map((call) => [call.url, call.auth])).toEqual([
      ["https://actions.test/token?run=1&audience=sustain-cloud", "Bearer request-token"],
      ["https://cloud.test/api/v1/uploads", "Bearer oidc-jwt"],
    ]);
    expect(calls[1]!.body).toMatchObject({ repo: "acme/shop", branch: "feature", kind: "check", meta: { pull: 42, defaultBranch: "main" }, check: { result: "pass" } });
    expect(calls[1]!.body.map.meta.title).toBe("Shop");
    expect(result.comment).toContain("[See it on the map in Sustain Cloud](https://cloud.test/acme/shop/pull/42)");
  });

  test("without upload nothing is sent; without the id-token permission the upload is skipped and said so", async () => {
    const root = checkout();
    let sent = 0;
    const fetcher = (async () => {
      sent++;
      return Response.json({});
    }) as unknown as typeof fetch;
    await runAction({ env: env(), root, event: EVENT, client: fakeGitHub(), log: () => undefined, fetcher });
    expect(sent).toBe(0);
    const log: string[] = [];
    const result = await runAction({ env: { ...env({ upload: "true", "cloud-url": "https://cloud.test" }), GITHUB_REPOSITORY: "acme/shop" }, root, event: EVENT, client: fakeGitHub(), log: (line) => log.push(line), fetcher });
    expect(log[0]).toBe("Not uploaded: Uploading needs `permissions: id-token: write` on the job.");
    expect(result.result).toBe("pass");
    expect(sent).toBe(0);
  });
});
