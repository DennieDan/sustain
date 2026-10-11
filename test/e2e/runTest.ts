import { runTests } from "@vscode/test-electron";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The VS Code build the [e2e] suite runs against; package.json engines.vscode matches it.
const VSCODE_VERSION = "1.141.0";

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
  for (const scenario of SCENARIOS) {
    if (only && scenario.name !== only) continue;
    const base = realpathSync(mkdtempSync(join(tmpdir(), `sustain-e2e-${scenario.name}-`)));
    // VS Code puts its IPC socket in the user-data dir; macOS caps socket paths at 104 bytes,
    // which the per-user tmpdir (/var/folders/…) would exceed.
    const userData = mkdtempSync(join(process.platform === "win32" ? tmpdir() : "/tmp", "sustain-ud-"));
    const workspace = scenario.workspace(base);
    console.log(`\n=== e2e scenario: ${scenario.name} ===`);
    try {
      await runTests({
        version: VSCODE_VERSION,
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: { SUSTAIN_E2E_SCENARIO: scenario.name },
        launchArgs: [
          ...(workspace ? [workspace] : []),
          `--user-data-dir=${userData}`,
          "--disable-extensions",
          "--skip-welcome",
          "--skip-release-notes",
        ],
      });
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(userData, { recursive: true, force: true });
    }
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
