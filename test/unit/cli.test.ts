// RCH-03, PRC-01's exit codes and CLD-09: every core CLI command against temporary repositories,
// run as the built dist/cli/sustain.mjs beside its skills; publish against a fake cloud.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vitest";
import { TEST_DIST } from "./support/buildScripts";
import { git, gitRepo, put, runScript, tempDir } from "./support/temp";

const CLI = join(TEST_DIST, "cli/sustain.mjs");
const HANDLER = ["export function handle(req) {", "  const body = parse(req);", "  return save(body);", "}", ""].join("\n");

function cli(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): { status: number | null; stdout: string; json: () => any } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: options.cwd, encoding: "utf8", env: options.env ?? process.env });
  return { status: result.status, stdout: result.stdout, json: () => JSON.parse(result.stdout) };
}

/** A repository on `main` with a committed, accepted map; work continues on `feature`. */
function mappedRepo(): { root: string; run: string } {
  const root = gitRepo({ "src/api/handler.ts": HANDLER, "src/store/db.ts": "export const db = {};\n" });
  const facts = runScript("repo-facts", [], { cwd: root }).json();
  put(
    root,
    facts.draft,
    JSON.stringify({
      meta: { title: "Shop" },
      components: [
        { id: "api", type: "backend", label: "API", sources: [{ path: "src/api/handler.ts", line: 1, end_line: 4 }] },
        { id: "store", type: "database", label: "Store", sources: [{ path: "src/store/db.ts", line: 1 }] },
      ],
    }),
  );
  expect(runScript("validate", [facts.draft], { cwd: root }).status).toBe(0);
  git(root, "add", ".");
  git(root, "commit", "-qm", "map");
  git(root, "checkout", "-qb", "feature");
  return { root, run: facts.runFolder.replace(".archify/", "") };
}

describe("RCH-03 install and verify-skills", () => {
  test("install --scope project writes every skill; verify-skills finds them intact, then a changed file", () => {
    const root = tempDir();
    const installed = cli(["install", "--scope", "project", "--root", root], { cwd: root });
    expect(installed.status).toBe(0);
    expect(installed.json()).toEqual({ status: "installed", base: root, skills: ["sustain-architecture", "sustain-bugfix", "sustain-refresh"] });
    expect(existsSync(join(root, ".claude/skills/sustain-refresh/SKILL.md"))).toBe(true);

    const intact = cli(["verify-skills", "--scope", "project"], { cwd: root });
    expect([intact.status, intact.json().status]).toEqual([0, "intact"]);
    writeFileSync(join(root, ".agents/skills/sustain-architecture/SKILL.md"), "changed");
    const changed = cli(["verify-skills", "--scope", "project"], { cwd: root });
    expect(changed.status).toBe(1);
    expect(changed.json().skills["sustain-architecture"]).toEqual({ intact: false, differing: 1, otherCopies: [] });
  });

  test("install defaults to the user's home, and missing skills do not verify", () => {
    const root = tempDir();
    const home = tempDir();
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    expect(cli(["verify-skills"], { cwd: root, env }).json().skills["sustain-architecture"]).toEqual({ intact: false, differing: null, otherCopies: [] });
    expect(cli(["install"], { cwd: root, env }).json().base).toBe(home);
    expect(existsSync(join(home, ".agents/skills/sustain-architecture/scripts/render-html.mjs"))).toBe(true);
    expect(cli(["verify-skills"], { cwd: root, env }).status).toBe(0);
  });
});

describe("RCH-03 map commands", () => {
  test("staleness reports each box against the code", () => {
    const { root, run } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    const result = cli(["staleness"], { cwd: root });
    expect(result.status).toBe(0);
    expect(result.json()).toMatchObject({ map: run, fingerprints: true, boxes: { api: "edited", store: "fresh" } });
  });

  test("changes marks boxes for a scope and refuses an unknown one", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("parse(req)", "parseJson(req)"));
    expect(cli(["changes", "--scope", "uncommitted"], { cwd: root }).json()).toMatchObject({ scope: "uncommitted", strong: ["api"], weak: [] });
    git(root, "commit", "-qam", "edit");
    expect(cli(["changes", "--scope", "range", "--range", "main..HEAD"], { cwd: root }).json()).toMatchObject({ strong: ["api"] });
    expect(cli(["changes", "--scope", "everything"], { cwd: root }).status).toBe(2);
  });

  test("export-page writes the map's page, without the root when shared", () => {
    const { root, run } = mappedRepo();
    const result = cli(["export-page", "--share"], { cwd: root });
    const { status, page } = result.json() as { status: string; page: string };
    expect(status).toBe("written");
    expect(page).toMatch(new RegExp(`^\\.archify/${run}/[a-z0-9-]+\\.html$`));
    const html = readFileSync(join(root, page), "utf8");
    expect(html).toContain('"root":null');
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  test("preflight lists the checks and fails while one fails", () => {
    const root = tempDir();
    const result = cli(["preflight"], { cwd: root, env: { ...process.env, PATH: dirname(process.execPath), HOME: tempDir() } });
    expect(result.status).toBe(1);
    expect(result.json().checks.map((check: { id: string; ok: boolean }) => [check.id, check.ok])).toEqual([
      ["node", true],
      ["claude", false],
      ["codex", false],
      ["devin", false],
      ["skills", false],
      ["git", false],
    ]);
  });
});

describe("PRC-01 RCH-03 check and exit codes", () => {
  test("check passes with exit 0, fails under --fail-on with exit 1, and prints markdown on request", () => {
    const { root } = mappedRepo();
    put(root, "src/api/handler.ts", HANDLER.replace("save(body)", "store(body)"));
    git(root, "commit", "-qam", "edit");
    const pass = cli(["check", "--base", "main", "--head", "HEAD"], { cwd: root });
    expect([pass.status, pass.json().result, pass.json().stale.map((box: { id: string }) => box.id)]).toEqual([0, "pass", ["api"]]);
    const fail = cli(["check", "--base", "main", "--head", "HEAD", "--fail-on", "stale,new-box"], { cwd: root });
    expect([fail.status, fail.json().result]).toEqual([1, "fail"]);
    const markdown = cli(["check", "--base", "main", "--format", "markdown"], { cwd: root });
    expect(markdown.stdout.startsWith("### Sustain check: pass")).toBe(true);
  });

  test.each([
    [["check"], "check needs --base"],
    [["check", "--base", "main", "--fail-on", "everything"], "--fail-on takes"],
    [["check", "--base", "nope"], "No common commit"],
    [["unknown"], "usage"],
    [["staleness", "--format", "yaml"], "--format is json or markdown"],
    [["staleness", "stray"], "unexpected argument"],
  ])("%j is a usage error with exit 2", (args, message) => {
    const { root } = mappedRepo();
    const result = cli(args, { cwd: root });
    expect(result.status).toBe(2);
    expect(result.json().message).toContain(message);
  });

  test("a repository without a map is told how to make one", () => {
    const root = gitRepo({ "a.ts": "1\n" });
    expect(cli(["staleness"], { cwd: root }).json().message).toContain("No map");
  });
});

describe("CLD-09 publish", () => {
  /** A fake Sustain Cloud that records each upload and answers with `status`. */
  async function fakeCloud(status = 201): Promise<{ url: string; received: { auth: string | undefined; body: any }[]; close: () => Promise<void> }> {
    const received: { auth: string | undefined; body: any }[] = [];
    const server = createServer((request, response) => {
      let text = "";
      request.on("data", (chunk) => (text += chunk));
      request.on("end", () => {
        received.push({ auth: request.headers.authorization, body: JSON.parse(text) });
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(status === 201 ? { status: "accepted", id: 1, url: "/acme/shop" } : { status: "rejected", message: "nope" }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    return { url: `http://127.0.0.1:${port}`, received, close: () => new Promise((resolve) => server.close(() => resolve())) };
  }

  /** `cli` without blocking the event loop, so the fake cloud can answer. */
  function cliAsync(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): Promise<{ status: number | null; json: () => any }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, ...args], { cwd: options.cwd, env: options.env ?? process.env });
      let out = "";
      child.stdout.on("data", (chunk) => (out += chunk));
      child.on("close", (status) => resolve({ status, json: () => JSON.parse(out) }));
    });
  }

  function published(): { root: string; run: string } {
    const mapped = mappedRepo();
    git(mapped.root, "remote", "add", "origin", "https://github.com/acme/shop.git");
    return mapped;
  }

  test("publish sends the map with its sidecars and metadata, signed with SUSTAIN_TOKEN", async () => {
    const { root, run } = published();
    const cloud = await fakeCloud();
    try {
      const result = await cliAsync(["publish", "--url", cloud.url], { cwd: root, env: { ...process.env, SUSTAIN_TOKEN: "sus_test" } });
      expect([result.status, result.json().status]).toEqual([0, "published"]);
      expect(cloud.received).toHaveLength(1);
      const { auth, body } = cloud.received[0]!;
      expect(auth).toBe("Bearer sus_test");
      expect(body).toMatchObject({ repo: "acme/shop", commit: git(root, "rev-parse", "HEAD").trim(), branch: "feature", kind: "map", meta: { run } });
      expect(Object.keys(body.sidecars).sort()).toEqual(["evidence", "fingerprints", "run"]);
      expect(body.map.meta.title).toBe("Shop");
    } finally {
      await cloud.close();
    }
  });

  test("--dry-run prints exactly what would be sent and sends nothing", async () => {
    const { root } = published();
    const cloud = await fakeCloud();
    try {
      const result = await cliAsync(["publish", "--url", cloud.url, "--dry-run"], { cwd: root, env: { ...process.env, SUSTAIN_TOKEN: "sus_test" } });
      expect(result.status).toBe(0);
      expect(result.json()).toMatchObject({ status: "dry-run", url: cloud.url, payload: { repo: "acme/shop", kind: "map" } });
      expect(cloud.received).toEqual([]);
    } finally {
      await cloud.close();
    }
  });

  test("a secret in the map stops the upload before anything is sent", async () => {
    const { root, run } = published();
    const file = join(root, ".archify", run, "candidate.json");
    const doc = JSON.parse(readFileSync(file, "utf8"));
    doc.components[0].label = "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB";
    writeFileSync(file, JSON.stringify(doc));
    const cloud = await fakeCloud();
    try {
      const result = await cliAsync(["publish", "--url", cloud.url], { cwd: root, env: { ...process.env, SUSTAIN_TOKEN: "sus_test" } });
      expect(result.status).toBe(1);
      expect(result.json().issues[0]).toMatchObject({ code: "SecretLike", pointer: "/map/components/0/label" });
      expect(cloud.received).toEqual([]);
    } finally {
      await cloud.close();
    }
  });

  test("a refusal exits 1; no token, no address or no GitHub origin exits 2", async () => {
    const { root } = published();
    const cloud = await fakeCloud(422);
    try {
      expect((await cliAsync(["publish", "--url", cloud.url], { cwd: root, env: { ...process.env, SUSTAIN_TOKEN: "sus_test" } })).status).toBe(1);
    } finally {
      await cloud.close();
    }
    const env = { ...process.env, SUSTAIN_TOKEN: undefined, SUSTAIN_CLOUD_URL: undefined };
    expect((await cliAsync(["publish", "--url", "http://127.0.0.1:9"], { cwd: root, env })).status).toBe(2);
    expect((await cliAsync(["publish"], { cwd: root, env: { ...env, SUSTAIN_TOKEN: "sus_test" } })).status).toBe(2);
    git(root, "remote", "set-url", "origin", "https://gitlab.com/acme/shop.git");
    expect((await cliAsync(["publish", "--dry-run"], { cwd: root })).json().message).toContain("github.com origin");
  });
});
