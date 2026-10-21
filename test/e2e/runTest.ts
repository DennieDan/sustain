import { runTests } from "@vscode/test-electron";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The VS Code builds the [e2e] suite runs against: the engines.vscode floor and the latest stable.
const VSCODE_VERSIONS = ["1.126.0", "1.141.0"];

/**
 * Each scenario launches its own VS Code with a fresh profile and runs the suite files
 * named `<scenario>.*.test.js`.
 */
const SCENARIOS: { name: string; workspace(base: string): string | undefined }[] = [
  {
    name: "single",
    workspace: (base) => {
      const folder = join(base, "repo");
      mkdirSync(folder);
      return folder;
    },
  },
  { name: "empty", workspace: () => undefined },
  {
    name: "multi",
    workspace: (base) => {
      for (const name of ["alpha", "beta"]) mkdirSync(join(base, name));
      const file = join(base, "two.code-workspace");
      writeFileSync(file, JSON.stringify({ folders: [{ path: "alpha" }, { path: "beta" }] }));
      return file;
    },
  },
];

async function main(): Promise<void> {
  // Bundled to out/e2e/runTest.js, so the repo root is two levels up.
  const extensionDevelopmentPath = resolve(__dirname, "../..");
  const extensionTestsPath = resolve(__dirname, "suite/index.js");
  const only = process.argv[2];
  const runs = VSCODE_VERSIONS.flatMap((version) => SCENARIOS.map((scenario) => ({ version, scenario })));
  for (const { version, scenario } of runs) {
    if (only && scenario.name !== only) continue;
    const base = realpathSync(mkdtempSync(join(tmpdir(), `sustain-e2e-${scenario.name}-`)));
    // VS Code puts its IPC socket in the user-data dir; macOS caps socket paths at 104 bytes,
    // which the per-user tmpdir (/var/folders/…) would exceed.
    const userData = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "sustain-ud-"));
    const workspace = scenario.workspace(base);
    // Sustain runs git itself. VS Code's git extension, left on, threw an uncaught EPIPE from
    // `git check-ignore` when a test's folder went away, and failed whichever test was running.
    mkdirSync(join(userData, "User"), { recursive: true });
    writeFileSync(join(userData, "User", "settings.json"), `${JSON.stringify({ "git.enabled": false })}\n`);
    // Skills install per user by default (SET-01), so each launch gets its own home folder.
    const home = mkdtempSync(join(tmpdir(), "sustain-home-"));
    console.log(`\n=== e2e VS Code ${version}, scenario: ${scenario.name} ===`);
    try {
      await runTests({
        version,
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: { SUSTAIN_E2E_SCENARIO: scenario.name, HOME: home, USERPROFILE: home },
        // Each launch has its own home folder, which holds no macOS keychain. Secrets stay in memory
        // and encryption uses a mock keychain, so macOS never asks to create a keychain.
        launchArgs: [
          ...(workspace ? [workspace] : []),
          `--user-data-dir=${userData}`,
          "--disable-extensions",
          "--skip-welcome",
          "--skip-release-notes",
          "--use-inmemory-secretstorage",
          "--use-mock-keychain",
        ],
      });
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
