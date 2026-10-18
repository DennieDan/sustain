// Shared steps for the [web] tests: signing in through the mock GitHub, and uploading through the
// real API with an OIDC token signed by the mock's key.
import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const GITHUB = "http://127.0.0.1:3211";
export const COMMIT = "0123456789abcdef0123456789abcdef01234567";
/** An Archify example whose first box cites src/api.ts lines 3 to 9, so it has something to open. */
export const MAP: Record<string, unknown> = (() => {
  const map = JSON.parse(readFileSync(join(__dirname, "../../../fixtures/archify/examples/rag-pipeline.architecture.json"), "utf8")) as { components: Record<string, unknown>[] };
  map.components[0]!["sources"] = [{ path: "src/api.ts", line: 3, end_line: 9 }];
  return map;
})();

export async function signInAsDev(page: Page, then = "/settings"): Promise<void> {
  await page.goto(`/signin?callbackUrl=${encodeURIComponent(then)}`);
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();
  await page.waitForURL((url) => url.pathname === then.split("?")[0]);
  await expect(page.locator(".site-header .account")).toContainText("dev");
}

async function oidcToken(repo: string): Promise<string> {
  const pem = await (await fetch(`${GITHUB}/__test/private-key`)).text();
  const now = Math.floor(Date.now() / 1000);
  const part = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");
  const head = part({ alg: "RS256", typ: "JWT", kid: "web-test" });
  const name = repo.split("/")[1]!;
  const body = part({
    iss: "https://token.actions.githubusercontent.com",
    aud: "sustain-cloud",
    iat: now,
    exp: now + 300,
    repository: repo,
    repository_id: [...name].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7) % 1_000_000,
    repository_owner: repo.split("/")[0],
    repository_visibility: name.startsWith("open") ? "public" : "private",
  });
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), createPrivateKey(pem)).toString("base64url")}`;
}

export async function upload(request: APIRequestContext, repo: string, body: Record<string, unknown>): Promise<void> {
  const response = await request.post("/api/v1/uploads", { data: { repo, commit: COMMIT, ...body }, headers: { authorization: `Bearer ${await oidcToken(repo)}` } });
  expect(response.status(), await response.text()).toBe(201);
}

export function check(pull: number): Record<string, unknown> {
  const ids = (MAP["components"] as { id: string }[]).map((component) => component.id);
  return {
    branch: "feature",
    kind: "check",
    check: {
      map: "architecture-shop-20261018-120000",
      base: "origin/main",
      head: "HEAD",
      mergeBase: COMMIT,
      touched: { strong: [{ id: ids[0], label: "first" }], weak: [{ id: ids[1], label: "second" }] },
      stale: [{ id: ids[2], label: "third", state: "edited" }],
      uncovered: ["src/new.ts"],
      candidates: [{ dir: "src/payments", files: [{ path: "src/payments/a.ts", added: 40 }], lines: 40, label: "payments" }],
      gone: [],
      result: "pass",
      reasons: [],
    },
    meta: { pull },
  };
}
