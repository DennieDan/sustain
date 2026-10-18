// [web]: Playwright against the built cloud app, with GitHub replaced by test/web/mockGithub.mjs and
// a fresh PGlite folder per run. When Playwright's own Chromium is not installed, the newest cached
// headless shell is used, or SUSTAIN_CHROMIUM when set.
import { chromium, defineConfig } from "@playwright/test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const APP = 3210;
const GITHUB = 3211;

function browserPath(): string | undefined {
  if (process.env["SUSTAIN_CHROMIUM"]) return process.env["SUSTAIN_CHROMIUM"];
  if (existsSync(chromium.executablePath())) return undefined;
  const cache = join(homedir(), ".cache/ms-playwright");
  const shells = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort() : [];
  const newest = shells.at(-1);
  return newest === undefined ? undefined : join(cache, newest, "chrome-headless-shell-linux64/chrome-headless-shell");
}

const executablePath = browserPath();

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
    {
      command: `npm run start -- -p ${APP} -H 127.0.0.1`,
      url: `http://127.0.0.1:${APP}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        SUSTAIN_DB: mkdtempSync(join(tmpdir(), "sustain-web-db-")),
        NEXTAUTH_URL: `http://127.0.0.1:${APP}`,
        NEXTAUTH_SECRET: "web-test-secret-web-test-secret",
        GITHUB_CLIENT_ID: "web-client",
        GITHUB_CLIENT_SECRET: "web-secret",
        GITHUB_OAUTH_URL: `http://127.0.0.1:${GITHUB}`,
        GITHUB_API_URL: `http://127.0.0.1:${GITHUB}`,
        SUSTAIN_OIDC_JWKS_URL: `http://127.0.0.1:${GITHUB}/.well-known/jwks`,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ],
});
