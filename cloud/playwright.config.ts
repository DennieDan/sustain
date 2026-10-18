// [web]: Playwright against the built cloud app, with GitHub replaced by test/web/mockGithub.mjs and
// a fresh PGlite folder per run. A second instance of the app has billing on, against Stripe replaced
// by test/web/mockStripe.mjs (CLD-07). When Playwright's own Chromium is not installed, the newest
// cached headless shell is used, or SUSTAIN_CHROMIUM when set.
import { chromium, defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { BILLED_APP } from "./test/web/support";

const APP = 3210;
const GITHUB = 3211;
const STRIPE = 3212;
const WEBHOOK_SECRET = "whsec_web";

function browserPath(): string | undefined {
  if (process.env["SUSTAIN_CHROMIUM"]) return process.env["SUSTAIN_CHROMIUM"];
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = join(homedir(), ".cache/ms-playwright");
  const shells = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort() : [];
  const newest = shells.at(-1);
  return newest === undefined ? undefined : join(cache, newest, "chrome-headless-shell-linux64/chrome-headless-shell");
}

const executablePath = browserPath();

/** The built app on `port` with its own database, and `extra` in its environment. */
function app(port: number, extra: Record<string, string>) {
  return {
    command: `npm run start -- -p ${port} -H 127.0.0.1`,
    url: `http://127.0.0.1:${port}/`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      SUSTAIN_DB: mkdtempSync(join(tmpdir(), "sustain-web-db-")),
      NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      NEXTAUTH_SECRET: "web-test-secret-web-test-secret",
      GITHUB_CLIENT_ID: "web-client",
      GITHUB_CLIENT_SECRET: "web-secret",
      GITHUB_OAUTH_URL: `http://127.0.0.1:${GITHUB}`,
      GITHUB_API_URL: `http://127.0.0.1:${GITHUB}`,
      SUSTAIN_OIDC_JWKS_URL: `http://127.0.0.1:${GITHUB}/.well-known/jwks`,
      NEXT_TELEMETRY_DISABLED: "1",
      ...extra,
    },
  };
}

export default defineConfig({
  testDir: "test/web",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  // A cold page draws its map with the layout engine; a busy runner can take longer than the default 5 s.
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${APP}`,
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: [
    { command: `node test/web/mockGithub.mjs ${GITHUB}`, url: `http://127.0.0.1:${GITHUB}/.well-known/jwks`, reuseExistingServer: false },
    { command: `node test/web/mockStripe.mjs ${STRIPE} ${WEBHOOK_SECRET}`, url: `http://127.0.0.1:${STRIPE}/health`, reuseExistingServer: false },
    app(APP, {}),
    app(BILLED_APP, { STRIPE_SECRET_KEY: "sk_test_web", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_TEAM_PRICE: "price_team_web", STRIPE_API_URL: `http://127.0.0.1:${STRIPE}`, SUSTAIN_TEAM_PRICE_TEXT: "$8 per seat a month" }),
  ],
});
