import { runTests } from "@vscode/test-electron";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The VS Code build the [e2e] suite runs against; package.json engines.vscode matches it.
const VSCODE_VERSION = "1.141.0";

async function main(): Promise<void> {
  // Bundled to out/e2e/runTest.js, so the repo root is two levels up.
  const extensionDevelopmentPath = resolve(__dirname, "../..");
  const extensionTestsPath = resolve(__dirname, "suite/index.js");
  const workspace = mkdtempSync(join(tmpdir(), "sustain-e2e-"));
  try {
    await runTests({
      version: VSCODE_VERSION,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, "--disable-extensions", "--skip-welcome", "--skip-release-notes"],
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
